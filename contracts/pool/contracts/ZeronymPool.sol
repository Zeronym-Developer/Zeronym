// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";

interface IVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[8] calldata input) external view returns (bool);
}

/// @title Zeronym shielded pool
/// @notice One transact() call shields, sends or withdraws, depending on extAmount.
///   extAmount > 0  shield: the caller's tokens move into the pool (public deposit)
///   extAmount = 0  private transfer inside the pool
///   extAmount < 0  withdraw to extData.recipient (public withdrawal)
/// A relayer may submit the call and take extData.fee, which the proof binds.
/// @dev No external security review yet. The admin can only turn deposits of a token on or off,
/// and hand the admin role on. It can't block private transfers or withdrawals, move funds or upgrade the pool.
/// Structure follows Tornado Nova, with an asset field so one pool holds several tokens.
contract ZeronymPool is MerkleTreeWithHistory, ReentrancyGuard {
    using SafeERC20 for IERC20;

    int256 public constant MAX_EXT_AMOUNT = 2 ** 248;
    uint256 public constant MAX_FEE = 2 ** 248;

    IVerifier public immutable verifier;
    address public admin;

    /// Tokens accepted for deposit (PRD R3.9). Only plain ERC-20s: no rebasing, fee-on-transfer or callbacks.
    mapping(address => bool) public supportedToken;
    mapping(bytes32 => bool) public nullifierHashes;

    struct ExtData {
        address recipient;
        int256 extAmount;
        address relayer;
        uint256 fee;
        bytes encryptedOutput1;
        bytes encryptedOutput2;
        address token;
    }

    struct Proof {
        bytes proof;
        bytes32 root;
        bytes32[2] inputNullifiers;
        bytes32[2] outputCommitments;
        uint256 publicAmount;
        bytes32 extDataHash;
    }

    event NewCommitment(bytes32 commitment, uint256 index, bytes encryptedOutput);
    event NewNullifier(bytes32 nullifier);
    event TokenSupport(address indexed token, bool supported);
    event AdminChanged(address admin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    constructor(address _verifier, address _hasher, uint32 _levels, address _admin) MerkleTreeWithHistory(_levels, _hasher) {
        verifier = IVerifier(_verifier);
        admin = _admin;
    }

    function setToken(address _token, bool _supported) external onlyAdmin {
        require(uint256(uint160(_token)) < FIELD_SIZE, "token out of field");
        supportedToken[_token] = _supported;
        emit TokenSupport(_token, _supported);
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
        emit AdminChanged(_admin);
    }

    /// Token support gates deposits only. Notes of a token can exist only through deposits,
    /// so turning a token off can never block private transfers or withdrawals of it.
    function transact(Proof calldata _args, ExtData calldata _extData) external nonReentrant {
        if (_extData.extAmount > 0) {
            require(supportedToken[_extData.token], "token not supported");
            uint256 amount = uint256(_extData.extAmount);
            IERC20 t = IERC20(_extData.token);
            uint256 before = t.balanceOf(address(this));
            t.safeTransferFrom(msg.sender, address(this), amount);
            require(t.balanceOf(address(this)) - before == amount, "fee-on-transfer tokens are not supported");
        }
        _transact(_args, _extData);
    }

    function calculatePublicAmount(int256 _extAmount, uint256 _fee) public pure returns (uint256) {
        require(_fee < MAX_FEE, "Invalid fee");
        require(_extAmount > -MAX_EXT_AMOUNT && _extAmount < MAX_EXT_AMOUNT, "Invalid ext amount");
        int256 publicAmount = _extAmount - int256(_fee);
        return (publicAmount >= 0) ? uint256(publicAmount) : FIELD_SIZE - uint256(-publicAmount);
    }

    function isSpent(bytes32 _nullifierHash) public view returns (bool) {
        return nullifierHashes[_nullifierHash];
    }

    function verifyProof(Proof calldata _args, address _token) public view returns (bool) {
        uint256[8] memory p = abi.decode(_args.proof, (uint256[8]));
        return verifier.verifyProof(
            [p[0], p[1]],
            [[p[2], p[3]], [p[4], p[5]]],
            [p[6], p[7]],
            [
                uint256(_args.root),
                _args.publicAmount,
                uint256(_args.extDataHash),
                uint256(uint160(_token)),
                uint256(_args.inputNullifiers[0]),
                uint256(_args.inputNullifiers[1]),
                uint256(_args.outputCommitments[0]),
                uint256(_args.outputCommitments[1])
            ]
        );
    }

    function _transact(Proof calldata _args, ExtData calldata _extData) internal {
        require(isKnownRoot(_args.root), "Invalid merkle root");
        for (uint256 i = 0; i < 2; i++) {
            require(!isSpent(_args.inputNullifiers[i]), "Input is already spent");
        }
        require(uint256(_args.extDataHash) == uint256(keccak256(abi.encode(_extData))) % FIELD_SIZE, "Incorrect external data hash");
        require(_args.publicAmount == calculatePublicAmount(_extData.extAmount, _extData.fee), "Invalid public amount");
        require(verifyProof(_args, _extData.token), "Invalid transaction proof");

        for (uint256 i = 0; i < 2; i++) {
            nullifierHashes[_args.inputNullifiers[i]] = true;
        }

        IERC20 t = IERC20(_extData.token);
        if (_extData.extAmount < 0) {
            require(_extData.recipient != address(0), "Can't withdraw to zero address");
            t.safeTransfer(_extData.recipient, uint256(-_extData.extAmount));
        }
        if (_extData.fee > 0) {
            t.safeTransfer(_extData.relayer, _extData.fee);
        }

        uint32 index = _insert(_args.outputCommitments[0], _args.outputCommitments[1]);
        emit NewCommitment(_args.outputCommitments[0], index, _extData.encryptedOutput1);
        emit NewCommitment(_args.outputCommitments[1], index + 1, _extData.encryptedOutput2);
        for (uint256 i = 0; i < 2; i++) {
            emit NewNullifier(_args.inputNullifiers[i]);
        }
    }
}
