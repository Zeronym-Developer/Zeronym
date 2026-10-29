pragma circom 2.1.6;
// Zeronym shielded pool transaction circuit.
//
// One proof spends up to two notes and creates two new notes of the same asset.
// The same circuit covers every action:
//   shield    publicAmount > 0, inputs are zero-value dummies
//   send      publicAmount = -fee, an output goes to the recipient
//   withdraw  publicAmount < 0, the pool pays the external recipient
//
// note        commitment = Poseidon(amount, publicKey, blinding, asset)
// keypair     publicKey  = Poseidon(privateKey)
// nullifier   Poseidon(commitment, leafIndex, Poseidon(privateKey, commitment, leafIndex))
//
// Design follows the audited Tornado Nova transaction circuit, extended with an
// asset field so one pool can hold several tokens.
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./merkle.circom";

template Keypair() {
    signal input privateKey;
    signal output publicKey;
    component h = Poseidon(1);
    h.inputs[0] <== privateKey;
    publicKey <== h.out;
}

template Signature() {
    signal input privateKey;
    signal input commitment;
    signal input merklePath;
    signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== privateKey;
    h.inputs[1] <== commitment;
    h.inputs[2] <== merklePath;
    out <== h.out;
}

template Transaction(levels, nIns, nOuts) {
    signal input root;
    signal input publicAmount;   // extAmount - fee, as a field element
    signal input extDataHash;    // binds recipient, relayer, fee and encrypted outputs
    signal input asset;          // token address as a field element
    signal input inputNullifier[nIns];
    signal input outputCommitment[nOuts];

    signal input inAmount[nIns];
    signal input inPrivateKey[nIns];
    signal input inBlinding[nIns];
    signal input inPathIndices[nIns];
    signal input inPathElements[nIns][levels];

    signal input outAmount[nOuts];
    signal input outPubkey[nOuts];
    signal input outBlinding[nOuts];

    component inKeypair[nIns];
    component inSignature[nIns];
    component inCommitment[nIns];
    component inNullifier[nIns];
    component inTree[nIns];
    component inCheckRoot[nIns];
    component inAmountCheck[nIns];
    var sumIns = 0;

    for (var i = 0; i < nIns; i++) {
        inKeypair[i] = Keypair();
        inKeypair[i].privateKey <== inPrivateKey[i];

        inCommitment[i] = Poseidon(4);
        inCommitment[i].inputs[0] <== inAmount[i];
        inCommitment[i].inputs[1] <== inKeypair[i].publicKey;
        inCommitment[i].inputs[2] <== inBlinding[i];
        inCommitment[i].inputs[3] <== asset;

        inSignature[i] = Signature();
        inSignature[i].privateKey <== inPrivateKey[i];
        inSignature[i].commitment <== inCommitment[i].out;
        inSignature[i].merklePath <== inPathIndices[i];

        inNullifier[i] = Poseidon(3);
        inNullifier[i].inputs[0] <== inCommitment[i].out;
        inNullifier[i].inputs[1] <== inPathIndices[i];
        inNullifier[i].inputs[2] <== inSignature[i].out;
        inNullifier[i].out === inputNullifier[i];

        inTree[i] = MerkleProof(levels);
        inTree[i].leaf <== inCommitment[i].out;
        inTree[i].pathIndices <== inPathIndices[i];
        for (var j = 0; j < levels; j++) {
            inTree[i].pathElements[j] <== inPathElements[i][j];
        }

        // Zero-value dummy inputs don't need to be in the tree.
        inCheckRoot[i] = ForceEqualIfEnabled();
        inCheckRoot[i].in[0] <== root;
        inCheckRoot[i].in[1] <== inTree[i].root;
        inCheckRoot[i].enabled <== inAmount[i];

        inAmountCheck[i] = Num2Bits(248);
        inAmountCheck[i].in <== inAmount[i];

        sumIns += inAmount[i];
    }

    component outCommitment[nOuts];
    component outAmountCheck[nOuts];
    var sumOuts = 0;

    for (var i = 0; i < nOuts; i++) {
        outCommitment[i] = Poseidon(4);
        outCommitment[i].inputs[0] <== outAmount[i];
        outCommitment[i].inputs[1] <== outPubkey[i];
        outCommitment[i].inputs[2] <== outBlinding[i];
        outCommitment[i].inputs[3] <== asset;
        outCommitment[i].out === outputCommitment[i];

        outAmountCheck[i] = Num2Bits(248);
        outAmountCheck[i].in <== outAmount[i];

        sumOuts += outAmount[i];
    }

    // The same note can't be spent twice in one transaction.
    component sameNullifiers[nIns * (nIns - 1) / 2];
    var index = 0;
    for (var i = 0; i < nIns - 1; i++) {
        for (var j = i + 1; j < nIns; j++) {
            sameNullifiers[index] = IsEqual();
            sameNullifiers[index].in[0] <== inputNullifier[i];
            sameNullifiers[index].in[1] <== inputNullifier[j];
            sameNullifiers[index].out === 0;
            index++;
        }
    }

    // Value is conserved.
    sumIns + publicAmount === sumOuts;

    // Bind the public inputs that no other constraint uses.
    signal extDataSquare <== extDataHash * extDataHash;
}

component main {public [root, publicAmount, extDataHash, asset, inputNullifier, outputCommitment]} = Transaction(20, 2, 2);
