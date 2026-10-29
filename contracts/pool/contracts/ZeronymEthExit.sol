// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ZeronymPool} from "./ZeronymPool.sol";

/// Uniswap SwapRouter02 (exact input, one pool).
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

/// @title Zeronym ETH exit forwarder
/// @notice One per order, at an address derived from the order. A withdrawal pays its tokens here;
/// only the exit contract that created it can move them, and only on to that order's recipient.
contract ZeronymEthExitForwarder {
    using SafeERC20 for IERC20;

    address public immutable exit;

    constructor() {
        exit = msg.sender;
    }

    function sweep(address token) external returns (uint256 amount) {
        require(msg.sender == exit, "only the exit contract");
        amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(exit, amount);
    }
}

/// @title Zeronym ETH exit
/// @notice Withdraw from the Zeronym pool and receive ETH instead of the token, in one transaction.
/// @dev The pool is unchanged. Its proof fixes extData.recipient, so the recipient is set to a
/// forwarder address derived (CREATE2) from the whole order: token, ETH recipient, minimum
/// ETH out, deadline, Uniswap fee tier and a random nonce. Nobody can change any of these without
/// changing the forwarder address, which would break the proof.
///
/// withdraw() runs pool.transact, then swaps everything the forwarder received for ETH on Uniswap
/// and sends it to the order's recipient. If the swap would give less than minEthOut, the whole
/// transaction reverts and no note is spent.
///
/// If the proof reaches the pool some other way, the tokens wait in the forwarder. Anyone can then
/// call settle(): before the deadline it swaps at no less than minEthOut, after the deadline it
/// sends the tokens themselves to the recipient. Funds are never stuck and never go anywhere else.
///
/// The contract holds nothing between transactions and has no owner or admin.
contract ZeronymEthExit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address token;
        address payable recipient;
        uint256 minEthOut;
        uint256 deadline;
        uint24 fee;
        bytes32 nonce;
    }

    ZeronymPool public immutable pool;
    ISwapRouter02 public immutable router;
    IWETH9 public immutable weth;
    address public immutable forwarderImplementation;

    /// swapped = false means the deadline had passed and the token itself was sent.
    event Settled(address indexed forwarder, address indexed recipient, address token, uint256 amountIn, uint256 ethOut, bool swapped);

    constructor(address _pool, address _router, address _weth) {
        pool = ZeronymPool(_pool);
        router = ISwapRouter02(_router);
        weth = IWETH9(_weth);
        forwarderImplementation = address(new ZeronymEthExitForwarder());
    }

    /// The address to put in extData.recipient for this order.
    function forwarderOf(Order calldata o) public view returns (address) {
        return Clones.predictDeterministicAddress(forwarderImplementation, keccak256(abi.encode(o)));
    }

    /// Withdraw from the pool and pay the order's recipient in ETH. Reverts entirely if the swap
    /// would give less than o.minEthOut, or if the deadline has passed.
    function withdraw(ZeronymPool.Proof calldata args, ZeronymPool.ExtData calldata extData, Order calldata o) external nonReentrant returns (uint256 ethOut) {
        require(block.timestamp <= o.deadline, "order expired");
        require(extData.recipient == forwarderOf(o), "recipient is not this order's forwarder");
        require(extData.token == o.token, "token does not match the order");
        require(extData.extAmount < 0, "not a withdrawal");
        pool.transact(args, extData);
        ethOut = _settle(o);
    }

    /// Pays out whatever the order's forwarder holds: as ETH (at least minEthOut) until the
    /// deadline, as the token itself after it. Anyone may call it; the money only goes to o.recipient.
    function settle(Order calldata o) external nonReentrant returns (uint256 ethOut) {
        ethOut = _settle(o);
    }

    function _settle(Order calldata o) internal returns (uint256 ethOut) {
        bytes32 salt = keccak256(abi.encode(o));
        address f = Clones.predictDeterministicAddress(forwarderImplementation, salt);
        require(IERC20(o.token).balanceOf(f) > 0, "nothing to settle");
        if (f.code.length == 0) Clones.cloneDeterministic(forwarderImplementation, salt);

        IERC20 t = IERC20(o.token);
        uint256 before = t.balanceOf(address(this));
        ZeronymEthExitForwarder(f).sweep(o.token);
        uint256 amount = t.balanceOf(address(this)) - before;

        if (block.timestamp > o.deadline) {
            t.safeTransfer(o.recipient, amount);
            emit Settled(f, o.recipient, o.token, amount, 0, false);
            return 0;
        }

        t.forceApprove(address(router), amount);
        ethOut = router.exactInputSingle(ISwapRouter02.ExactInputSingleParams({
            tokenIn: o.token,
            tokenOut: address(weth),
            fee: o.fee,
            recipient: address(this),
            amountIn: amount,
            amountOutMinimum: o.minEthOut,
            sqrtPriceLimitX96: 0
        }));
        require(ethOut >= o.minEthOut, "too little ETH");
        weth.withdraw(ethOut);
        (bool ok, ) = o.recipient.call{value: ethOut}("");
        if (!ok) {
            // A recipient contract that refuses ETH gets WETH instead.
            weth.deposit{value: ethOut}();
            IERC20(address(weth)).safeTransfer(o.recipient, ethOut);
        }
        emit Settled(f, o.recipient, o.token, amount, ethOut, true);
    }

    receive() external payable {
        require(msg.sender == address(weth), "only WETH");
    }
}
