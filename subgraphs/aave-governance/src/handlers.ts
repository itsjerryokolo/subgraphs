import {
  Address,
  BigDecimal,
  BigInt,
  Bytes,
  ethereum,
  log,
  ipfs,
  json,
  JSONValue,
  JSONValueKind,
} from "@graphprotocol/graph-ts";
import {
  BIGDECIMAL_ZERO,
  BIGINT_ONE,
  BIGINT_ZERO,
  GOVERNANCE_TYPE,
  ProposalState,
  VoteChoice,
  ZERO_ADDRESS,
} from "./constants";
import {
  Delegate,
  Governance,
  DelegateVotingPowerChange,
  Proposal,
  TokenDailySnapshot,
  TokenHolder,
  Vote,
  VoteDailySnapshot,
  DelegateChange,
} from "../generated/schema";

export const SECONDS_PER_DAY = 60 * 60 * 24;

export function toDecimal(value: BigInt, decimals: number = 18): BigDecimal {
  return value.divDecimal(
    BigInt.fromI32(10)
      .pow(<u8>decimals)
      .toBigDecimal()
  );
}
export function addressesToStrings(addresses: Address[]): Array<string> {
  const byteAddresses = new Array<string>();
  for (let i = 0; i < addresses.length; i++) {
    byteAddresses.push(addresses[i].toHexString());
  }
  return byteAddresses;
}

export function getVoteChoiceByValue(choiceValue: boolean): string {
  if (choiceValue === true) {
    return VoteChoice.FOR;
  } else {
    return VoteChoice.AGAINST;
  }
}

export function getGovernance(): Governance {
  let governance = Governance.load(GOVERNANCE_TYPE);

  if (!governance) {
    governance = new Governance(GOVERNANCE_TYPE);
    governance.totalTokenSupply = BIGINT_ZERO;
    governance.proposals = BIGINT_ZERO;
    governance.currentTokenHolders = BIGINT_ZERO;
    governance.totalTokenHolders = BIGINT_ZERO;
    governance.currentDelegates = BIGINT_ZERO;
    governance.totalDelegates = BIGINT_ZERO;
    governance.delegatedVotesRaw = BIGINT_ZERO;
    governance.delegatedVotes = BIGDECIMAL_ZERO;

    governance.totalStakedTokenSupply = BIGINT_ZERO;
    governance.currentStakedTokenHolders = BIGINT_ZERO;
    governance.totalStakedTokenHolders = BIGINT_ZERO;
    governance.currentStakedTokenDelegates = BIGINT_ZERO;
    governance.totalStakedTokenDelegates = BIGINT_ZERO;
    governance.delegatedStakedTokenVotesRaw = BIGINT_ZERO;
    governance.delegatedStakedTokenVotes = BIGDECIMAL_ZERO;

    governance.proposalsQueued = BIGINT_ZERO;
    governance.proposalsExecuted = BIGINT_ZERO;
    governance.proposalsCanceled = BIGINT_ZERO;
  }

  return governance;
}

export function createDelegateChange(
  event: ethereum.Event,
  toDelegate: string,
  fromDelegate: string,
  delegator: string
): DelegateChange {
  const delegateChangeId = `${event.block.timestamp.toI64()}-${event.logIndex}`;

  const delegateChange = new DelegateChange(delegateChangeId);

  delegateChange.delegate = toDelegate;
  delegateChange.delegator = delegator;
  delegateChange.previousDelegate = fromDelegate;
  delegateChange.tokenAddress = event.address.toHexString();
  delegateChange.txnHash = event.transaction.hash.toHexString();
  delegateChange.blockNumber = event.block.number;
  delegateChange.blockTimestamp = event.block.timestamp;
  delegateChange.logIndex = event.logIndex;

  return delegateChange;
}

export function createDelegateVotingPowerChange(
  event: ethereum.Event,
  previousBalance: BigInt,
  newBalance: BigInt,
  delegate: string
): DelegateVotingPowerChange {
  const delegateVotingPwerChangeId = `${event.block.timestamp.toI64()}-${
    event.logIndex
  }`;

  const delegateVPChange = new DelegateVotingPowerChange(
    delegateVotingPwerChangeId
  );

  delegateVPChange.previousBalance = previousBalance;
  delegateVPChange.newBalance = newBalance;
  delegateVPChange.delegate = delegate;
  delegateVPChange.tokenAddress = event.address.toHexString();
  delegateVPChange.txnHash = event.transaction.hash.toHexString();
  delegateVPChange.blockTimestamp = event.block.timestamp;
  delegateVPChange.logIndex = event.logIndex;
  delegateVPChange.blockNumber = event.block.number;

  return delegateVPChange;
}

export function getProposal(id: string): Proposal {
  let proposal = Proposal.load(id);
  if (!proposal) {
    proposal = new Proposal(id);
    proposal.tokenHoldersAtStart = BIGINT_ZERO;
    proposal.delegatesAtStart = BIGINT_ZERO;
  }

  return proposal as Proposal;
}

export function isNewDelegate(address: string): boolean {
  return address != ZERO_ADDRESS && Delegate.load(address) == null;
}

export function getOrCreateDelegate(address: string): Delegate {
  let delegate = Delegate.load(address);
  if (!delegate) {
    delegate = new Delegate(address);
    delegate.delegatedVotesRaw = BIGINT_ZERO;
    delegate.delegatedVotes = BIGDECIMAL_ZERO;
    delegate.delegatedStakedTokenVotesRaw = BIGINT_ZERO;
    delegate.delegatedStakedTokenVotes = BIGDECIMAL_ZERO;
    delegate.tokenHoldersRepresentedAmount = 0;
    delegate.numberVotes = 0;
    delegate.save();
  }
  return delegate as Delegate;
}

export function getOrCreateTokenHolder(address: string): TokenHolder {
  let tokenHolder = TokenHolder.load(address);
  if (!tokenHolder) {
    tokenHolder = new TokenHolder(address);
    tokenHolder.tokenBalanceRaw = BIGINT_ZERO;
    tokenHolder.tokenBalance = BIGDECIMAL_ZERO;
    tokenHolder.totalTokensHeldRaw = BIGINT_ZERO;
    tokenHolder.totalTokensHeld = BIGDECIMAL_ZERO;
    tokenHolder.stakedTokenBalanceRaw = BIGINT_ZERO;
    tokenHolder.stakedTokenBalance = BIGDECIMAL_ZERO;
    tokenHolder.totalStakedTokensHeldRaw = BIGINT_ZERO;
    tokenHolder.totalStakedTokensHeld = BIGDECIMAL_ZERO;
    tokenHolder.save();

    if (address != ZERO_ADDRESS) {
      const governance = getGovernance();
      governance.totalTokenHolders =
        governance.totalTokenHolders.plus(BIGINT_ONE);
      governance.save();
    }
  }

  return tokenHolder as TokenHolder;
}
export function getOrCreateTokenDailySnapshot(
  block: ethereum.Block
): TokenDailySnapshot {
  const snapshotId = (block.timestamp.toI64() / SECONDS_PER_DAY).toString();
  const previousSnapshot = TokenDailySnapshot.load(snapshotId);

  if (previousSnapshot != null) {
    return previousSnapshot as TokenDailySnapshot;
  }
  const snapshot = new TokenDailySnapshot(snapshotId);
  return snapshot;
}
export function getOrCreateVoteDailySnapshot(
  proposal: Proposal,
  block: ethereum.Block
): VoteDailySnapshot {
  const snapshotId =
    proposal.id + "-" + (block.timestamp.toI64() / SECONDS_PER_DAY).toString();
  const previousSnapshot = VoteDailySnapshot.load(snapshotId);

  if (previousSnapshot != null) {
    return previousSnapshot as VoteDailySnapshot;
  }
  const snapshot = new VoteDailySnapshot(snapshotId);
  return snapshot;
}

export function _handleProposalCreated(
  proposalId: string,
  proposerAddr: string,
  executorAddr: string,
  targets: Address[],
  values: BigInt[],
  signatures: string[],
  calldatas: Bytes[],
  startBlock: BigInt,
  endBlock: BigInt,
  ipfsHash: Bytes,
  quorum: BigInt,
  event: ethereum.Event
): void {
  const proposal = getProposal(proposalId);
  let proposer = getOrCreateDelegate(proposerAddr);

  // Checking if the proposer was a delegate already accounted for, if not we should log an error
  // since it shouldn't be possible for a delegate to propose anything without first being "created"
  if (proposer == null) {
    log.error(
      "Delegate participant {} not found on ProposalCreated. tx_hash: {}",
      [proposerAddr, event.transaction.hash.toHexString()]
    );
  }

  // Creating it anyway since we will want to account for this event data, even though it should've never happened
  proposer = getOrCreateDelegate(proposerAddr);
  proposal.txnHash = event.transaction.hash.toHexString();
  proposal.executor = executorAddr;
  proposal.proposer = proposer.id;
  proposal.txnHash = event.transaction.hash.toHexString();
  proposal.quorumVotes = BIGINT_ZERO;
  proposal.againstDelegateVotes = BIGINT_ZERO;
  proposal.forDelegateVotes = BIGINT_ZERO;
  proposal.abstainDelegateVotes = BIGINT_ZERO;
  proposal.totalDelegateVotes = BIGINT_ZERO;
  proposal.againstWeightedVotes = BIGINT_ZERO;
  proposal.forWeightedVotes = BIGINT_ZERO;
  proposal.abstainWeightedVotes = BIGINT_ZERO;
  proposal.totalWeightedVotes = BIGINT_ZERO;
  proposal.targets = addressesToStrings(targets);
  proposal.values = values;
  proposal.signatures = signatures;
  proposal.calldatas = calldatas;
  proposal.creationBlock = event.block.number;
  proposal.creationTime = event.block.timestamp;
  proposal.startBlock = startBlock;
  proposal.endBlock = endBlock;

  // Get description from ipfs hash (from official Aave Governance Subgraph)
  // https://github.com/aave/governance-delegation-subgraph/blob/master/src/mapping/governance.ts#L33
  let description = "";
  const hash = Bytes.fromHexString(
    "1220" + ipfsHash.toHexString().slice(2)
  ).toBase58();
  const data = ipfs.cat(hash);
  const proposalData = json.try_fromBytes(data as Bytes);
  let descriptionJSON: JSONValue | null = null;
  if (proposalData.isOk && proposalData.value.kind == JSONValueKind.OBJECT) {
    const jsonData = proposalData.value.toObject();
    descriptionJSON = jsonData.get("description");
    if (descriptionJSON) {
      description = descriptionJSON.toString();
    }
  }
  proposal.description = description;
  proposal.governanceFramework = event.address.toHexString();

  // If start block reached, proposal starts as active
  if (event.block.number >= proposal.startBlock) {
    proposal.state = ProposalState.ACTIVE;

    // Set snapshot for quorum, tokenholders and delegates
    proposal.quorumVotes = quorum;
    const governance = getGovernance();
    proposal.tokenHoldersAtStart = governance.currentTokenHolders;
    proposal.delegatesAtStart = governance.currentDelegates;
  } else {
    proposal.state = ProposalState.PENDING;
  }

  proposal.save();

  // Increment gov proposal count
  const governance = getGovernance();
  governance.proposals = governance.proposals.plus(BIGINT_ONE);
  governance.save();
}

export function _handleProposalCanceled(
  proposalId: string,
  event: ethereum.Event
): void {
  const proposal = getProposal(proposalId);
  proposal.state = ProposalState.CANCELED;
  proposal.cancellationTxnHash = event.transaction.hash.toHexString();
  proposal.cancellationBlock = event.block.number;
  proposal.cancellationTime = event.block.timestamp;
  proposal.save();

  // Update governance proposal state counts
  const governance = getGovernance();
  governance.proposalsCanceled = governance.proposalsCanceled.plus(BIGINT_ONE);
  governance.save();
}

export function _handleProposalExecuted(
  proposalId: string,
  event: ethereum.Event
): void {
  // Update proposal status + execution metadata
  const proposal = getProposal(proposalId);
  proposal.state = ProposalState.EXECUTED;
  proposal.executionTxnHash = event.transaction.hash.toHexString();
  proposal.executionBlock = event.block.number;
  proposal.executionTime = event.block.timestamp;
  proposal.save();

  // Update governance proposal state counts
  const governance = getGovernance();
  governance.proposalsQueued = governance.proposalsQueued.minus(BIGINT_ONE);
  governance.proposalsExecuted = governance.proposalsExecuted.plus(BIGINT_ONE);
  governance.save();
}

export function _handleProposalQueued(
  proposalId: string,
  eta: BigInt,
  event: ethereum.Event
): void {
  // Update proposal status + execution metadata
  const proposal = getProposal(proposalId.toString());
  proposal.state = ProposalState.QUEUED;
  proposal.queueTxnHash = event.transaction.hash.toHexString();
  proposal.queueBlock = event.block.number;
  proposal.queueTime = event.block.timestamp;
  proposal.executionETA = eta;
  proposal.save();

  // Update governance proposal state counts
  const governance = getGovernance();
  governance.proposalsQueued = governance.proposalsQueued.plus(BIGINT_ONE);
  governance.save();
}

export function _handleVoteEmitted(
  proposal: Proposal,
  voterAddress: string,
  weight: BigInt,
  support: boolean,
  event: ethereum.Event
): void {
  const choice = getVoteChoiceByValue(support);
  const voteId = voterAddress.concat("-").concat(proposal.id);

  let vote = Vote.load(voteId);
  if (vote) {
    // Avoid edge case for duplicate votes with zero weights
    return;
  }

  vote = new Vote(voteId);
  vote.proposal = proposal.id;
  vote.voter = voterAddress;
  vote.weight = weight;
  vote.reason = null;
  vote.block = event.block.number;
  vote.blockTime = event.block.timestamp;
  vote.txnHash = event.transaction.hash.toHexString();
  vote.choice = choice;
  vote.logIndex = event.logIndex;
  vote.blockTimeId = `${event.block.timestamp.toI64()}-${event.logIndex}`;
  vote.save();

  // Increment respective vote choice counts
  if (choice === VoteChoice.AGAINST) {
    proposal.againstDelegateVotes =
      proposal.againstDelegateVotes.plus(BIGINT_ONE);
    proposal.againstWeightedVotes = proposal.againstWeightedVotes.plus(weight);
  } else {
    proposal.forDelegateVotes = proposal.forDelegateVotes.plus(BIGINT_ONE);
    proposal.forWeightedVotes = proposal.forWeightedVotes.plus(weight);
  }
  // Increment total
  proposal.totalDelegateVotes = proposal.totalDelegateVotes.plus(BIGINT_ONE);
  proposal.totalWeightedVotes = proposal.totalWeightedVotes.plus(weight);
  proposal.save();

  // Add 1 to participant's proposal voting count
  const voter = getOrCreateDelegate(voterAddress);
  voter.numberVotes = voter.numberVotes + 1;
  voter.save();

  // Take snapshot
  const dailySnapshot = getOrCreateVoteDailySnapshot(proposal, event.block);
  dailySnapshot.proposal = proposal.id;
  dailySnapshot.forWeightedVotes = proposal.forWeightedVotes;
  dailySnapshot.againstWeightedVotes = proposal.againstWeightedVotes;
  dailySnapshot.abstainWeightedVotes = proposal.abstainWeightedVotes;
  dailySnapshot.totalWeightedVotes = proposal.totalWeightedVotes;
  dailySnapshot.blockNumber = event.block.number;
  dailySnapshot.timestamp = event.block.timestamp;
  dailySnapshot.save();
}
