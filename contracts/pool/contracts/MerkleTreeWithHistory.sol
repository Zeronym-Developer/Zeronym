// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Poseidon(2) hasher, deployed from circomlibjs bytecode.
interface IHasher {
    function poseidon(bytes32[2] calldata input) external pure returns (bytes32);
}

/// @title Incremental Poseidon Merkle tree with a short root history.
/// @notice Leaves are inserted in pairs, so nextIndex is always even.
/// @dev Structure follows Tornado Nova's MerkleTreeWithHistory.
contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    /// keccak256("zeronym") % FIELD_SIZE
    uint256 public constant ZERO_VALUE = 19506251170085072150679270423557939845240257468815860835066582187690914938146;
    uint32 public constant ROOT_HISTORY_SIZE = 100;

    IHasher public immutable hasher;
    uint32 public immutable levels;

    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public zeros;
    mapping(uint256 => bytes32) public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    constructor(uint32 _levels, address _hasher) {
        require(_levels > 0 && _levels < 32, "levels out of range");
        levels = _levels;
        hasher = IHasher(_hasher);
        bytes32 z = bytes32(ZERO_VALUE);
        for (uint32 i = 0; i < _levels; i++) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = IHasher(_hasher).poseidon([z, z]);
        }
        roots[0] = z;
    }

    function hashLeftRight(bytes32 _left, bytes32 _right) public view returns (bytes32) {
        require(uint256(_left) < FIELD_SIZE, "left out of field");
        require(uint256(_right) < FIELD_SIZE, "right out of field");
        return hasher.poseidon([_left, _right]);
    }

    function _insert(bytes32 _leaf1, bytes32 _leaf2) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        require(_nextIndex != uint32(2) ** levels, "Merkle tree is full");
        uint32 currentIndex = _nextIndex / 2;
        bytes32 currentLevelHash = hashLeftRight(_leaf1, _leaf2);
        bytes32 left;
        bytes32 right;
        for (uint32 i = 1; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeros[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }
        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;
        nextIndex = _nextIndex + 2;
        return _nextIndex;
    }

    function isKnownRoot(bytes32 _root) public view returns (bool) {
        if (_root == 0) return false;
        uint32 i = currentRootIndex;
        do {
            if (_root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }
}
