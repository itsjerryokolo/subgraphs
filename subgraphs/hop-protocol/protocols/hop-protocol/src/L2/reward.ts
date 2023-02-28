import { SDK } from '../../../../src/sdk/protocols/bridge'
import { TokenPricer } from '../../../../src/sdk/protocols/config'
import {
	TokenInitializer,
	TokenParams,
} from '../../../../src/sdk/protocols/bridge/tokens'
import {
	BridgePermissionType,
	BridgePoolType,
} from '../../../../src/sdk/protocols/bridge/enums'
import { BridgeConfig } from '../../../../src/sdk/protocols/bridge/config'
import { Versions } from '../../../../src/versions'
import { NetworkConfigs } from '../../../../configurations/configure'
import {
	Address,
	BigDecimal,
	BigInt,
	log,
	dataSource,
} from '@graphprotocol/graph-ts'
import {
	L2_Reward,
	RewardPaid,
	Staked,
	Withdrawn,
} from '../../../../generated/HopL2Rewards/L2_Reward'
import { Token } from '../../../../generated/schema'
import { getUsdPricePerToken, getUsdPrice } from '../../../../src/prices/index'
import { bigIntToBigDecimal } from '../../../../src/sdk/util/numbers'
import {
	BIGINT_MINUS_ONE,
	BIGINT_TEN_TO_EIGHTEENTH,
	RewardTokenType,
} from '../../../../src/sdk/util/constants'
import {
	GNO_REWARDS,
	HOP_REWARDS,
	OP_REWARDS,
	RewardTokens,
} from '../../config/constants/constant'

class Pricer implements TokenPricer {
	getTokenPrice(token: Token): BigDecimal {
		const price = getUsdPricePerToken(Address.fromBytes(token.id))
		return price.usdPrice
	}

	getAmountValueUSD(token: Token, amount: BigInt): BigDecimal {
		const _amount = bigIntToBigDecimal(amount, token.decimals)
		return getUsdPrice(Address.fromBytes(token.id), _amount)
	}
}

const conf = new BridgeConfig(
	'0x03D7f750777eC48d39D080b020D83Eb2CB4e3547',
	'HOP-'
		.concat(
			dataSource
				.network()
				.toUpperCase()
				.replace('-', '_')
		)
		.concat('-BRIDGE'),
	'hop-'.concat(dataSource.network().replace('-', '_')).concat('-bridge'),
	BridgePermissionType.PERMISSIONLESS,
	Versions
)

class TokenInit implements TokenInitializer {
	getTokenParams(address: Address): TokenParams {
		const tokenConfig = NetworkConfigs.getTokenDetails(address.toHex())
		const name = tokenConfig[1]
		const symbol = tokenConfig[0]
		const decimals = BigInt.fromString(tokenConfig[2]).toI32()
		return { name, symbol, decimals }
	}
}

export function handleRewardsPaid(event: RewardPaid): void {
	if (
		NetworkConfigs.getRewardTokenList().includes(event.address.toHexString())
	) {
		if (GNO_REWARDS.includes(event.address.toHexString)) {
			let amount = event.params.reward

			const poolAddress = NetworkConfigs.getPoolAddressFromRewardTokenAddress(
				event.address.toHexString()
			)
			log.warning(
				'GNO RewardsPaid --> emitter: {}, poolAddress: {}, amount: {}',
				[event.address.toHexString(), poolAddress, amount.toString()]
			)

			const poolConfig = NetworkConfigs.getPoolDetails(poolAddress)
			log.warning('GNO RewardsPaid 1 --> poolAddress: {},', [poolAddress])

			const poolName = poolConfig[1]
			const poolSymbol = poolConfig[0]

			const sdk = SDK.initializeFromEvent(
				conf,
				new Pricer(),
				new TokenInit(),
				event
			)

			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.GNO)
			)

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token)
			}

			const Reward = L2_Reward.bind(event.address)
			const rewardRateCall = Reward.try_rewardRate()
			if (!rewardRateCall.reverted) {
				log.warning(
					'GNO RewardsPaid 2 --> txHash: {}, rewardRate: {}, bigTen: {}',
					[
						event.transaction.hash.toHexString(),
						rewardRateCall.value.toString(),
						BIGINT_TEN_TO_EIGHTEENTH.toString(),
					]
				)
				const rewardRate = rewardRateCall.value

				const dailyEmission = BigInt.fromI32(86400).times(rewardRate)
				pool.setRewardEmissions(RewardTokenType.DEPOSIT, token, dailyEmission)
				log.warning(
					'GNO RewardsPaid 3 --> txHash: {}, rewardRate: {}, dailyEmission: {}',
					[
						event.transaction.hash.toHexString(),
						rewardRate.toString(),
						dailyEmission.toString(),
					]
				)
			} else {
				log.warning('GNO Rewards rate call reverted', [])
			}
		} else if (OP_REWARDS.includes(event.address.toHexString)) {
			let amount = event.params.reward

			const poolAddress = NetworkConfigs.getPoolAddressFromRewardTokenAddress(
				event.address.toHexString()
			)
			log.warning(
				'OP RewardsPaid --> emitter: {}, poolAddress: {}, amount: {}',
				[event.address.toHexString(), poolAddress, amount.toString()]
			)

			const poolConfig = NetworkConfigs.getPoolDetails(poolAddress)
			log.warning('OP RewardsPaid 1 --> poolAddress: {},', [poolAddress])

			const poolName = poolConfig[1]
			const poolSymbol = poolConfig[0]

			const sdk = SDK.initializeFromEvent(
				conf,
				new Pricer(),
				new TokenInit(),
				event
			)

			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.OP)
			)

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token)
			}

			const Reward = L2_Reward.bind(event.address)
			const rewardRateCall = Reward.try_rewardRate()
			if (!rewardRateCall.reverted) {
				log.warning(
					'OP RewardsPaid 2 --> txHash: {}, rewardRate: {}, bigTen: {}',
					[
						event.transaction.hash.toHexString(),
						rewardRateCall.value.toString(),
						BIGINT_TEN_TO_EIGHTEENTH.toString(),
					]
				)
				const rewardRate = rewardRateCall.value

				const dailyEmission = BigInt.fromI32(86400).times(rewardRate)
				pool.setRewardEmissions(RewardTokenType.DEPOSIT, token, dailyEmission)
				log.warning(
					'OP RewardsPaid 3 --> txHash: {}, rewardRate: {}, dailyEmission: {}',
					[
						event.transaction.hash.toHexString(),
						rewardRate.toString(),
						dailyEmission.toString(),
					]
				)
			} else {
				log.warning('OP Rewards rate call reverted', [])
			}
		} else if (HOP_REWARDS.includes(event.address.toHexString)) {
			let amount = event.params.reward

			const poolAddress = NetworkConfigs.getPoolAddressFromRewardTokenAddress(
				event.address.toHexString()
			)
			log.warning(
				'HOP RewardsPaid --> emitter: {}, poolAddress: {}, amount: {}',
				[event.address.toHexString(), poolAddress, amount.toString()]
			)

			const poolConfig = NetworkConfigs.getPoolDetails(poolAddress)
			log.warning('RewardsPaid 1 --> poolAddress: {},', [poolAddress])

			const poolName = poolConfig[1]
			const poolSymbol = poolConfig[0]

			const sdk = SDK.initializeFromEvent(
				conf,
				new Pricer(),
				new TokenInit(),
				event
			)

			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.HOP)
			)

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token)
			}

			const Reward = L2_Reward.bind(event.address)
			const rewardRateCall = Reward.try_rewardRate()
			if (!rewardRateCall.reverted) {
				log.warning(
					'HOP RewardsPaid 2 --> txHash: {}, rewardRate: {}, bigTen: {}',
					[
						event.transaction.hash.toHexString(),
						rewardRateCall.value.toString(),
						BIGINT_TEN_TO_EIGHTEENTH.toString(),
					]
				)
				const rewardRate = rewardRateCall.value

				const dailyEmission = BigInt.fromI32(86400).times(rewardRate)
				pool.setRewardEmissions(RewardTokenType.DEPOSIT, token, dailyEmission)
				log.warning(
					'HOP RewardsPaid 3 --> txHash: {}, rewardRate: {}, dailyEmission: {}',
					[
						event.transaction.hash.toHexString(),
						rewardRate.toString(),
						dailyEmission.toString(),
					]
				)
			} else {
				log.warning('HOP Rewards rate call reverted', [])
			}
		}
	}
}
export function handleStaked(event: Staked): void {
	if (
		NetworkConfigs.getRewardTokenList().includes(event.address.toHexString())
	) {
		let amount = event.params.amount

		const poolAddress = NetworkConfigs.getPoolAddressFromRewardTokenAddress(
			event.address.toHexString()
		)
		log.warning('Staked --> emitter: {}, poolAddress: {}, amount: {}', [
			event.address.toHexString(),
			poolAddress,
			amount.toString(),
		])

		const poolConfig = NetworkConfigs.getPoolDetails(poolAddress)
		log.warning('Staked 1 --> poolAddress: {},', [poolAddress])

		const poolName = poolConfig[1]
		const poolSymbol = poolConfig[0]

		const sdk = SDK.initializeFromEvent(
			conf,
			new Pricer(),
			new TokenInit(),
			event
		)
		if (GNO_REWARDS.includes(event.address.toHexString)) {
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.GNO)
			)
			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token!)
			}
			pool.addStakedOutputTokenAmount(amount)
		} else if (OP_REWARDS.includes(event.address.toHexString)) {
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.GNO)
			)
			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token!)
			}
			pool.addStakedOutputTokenAmount(amount)
		} else if (HOP_REWARDS.includes(event.address.toHexString)) {
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.GNO)
			)
			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token!)
			}
			pool.addStakedOutputTokenAmount(amount)
		}

		sdk.Accounts.loadAccount(event.params.user)
	}
}

export function handleWithdrawn(event: Withdrawn): void {
	if (
		NetworkConfigs.getRewardTokenList().includes(event.address.toHexString())
	) {
		let amount = event.params.amount

		const poolAddress = NetworkConfigs.getPoolAddressFromRewardTokenAddress(
			event.address.toHexString()
		)
		log.warning('UnStaked --> emitter: {}, poolAddress: {}, amount: {}', [
			event.address.toHexString(),
			poolAddress,
			amount.toString(),
		])

		const poolConfig = NetworkConfigs.getPoolDetails(poolAddress)
		log.warning('UnStaked 1 --> poolAddress: {},', [poolAddress])

		const poolName = poolConfig[1]
		const poolSymbol = poolConfig[0]

		const sdk = SDK.initializeFromEvent(
			conf,
			new Pricer(),
			new TokenInit(),
			event
		)
		if (GNO_REWARDS.includes(event.address.toHexString)) {
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.GNO)
			)
			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token!)
			}
			pool.addStakedOutputTokenAmount(amount.times(BIGINT_MINUS_ONE))
		} else if (OP_REWARDS.includes(event.address.toHexString)) {
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.GNO)
			)
			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token!)
			}
			pool.addStakedOutputTokenAmount(amount.times(BIGINT_MINUS_ONE))
		} else if (HOP_REWARDS.includes(event.address.toHexString)) {
			const token = sdk.Tokens.getOrCreateToken(
				Address.fromString(RewardTokens.GNO)
			)
			const pool = sdk.Pools.loadPool<string>(Address.fromString(poolAddress))

			if (!pool.isInitialized) {
				pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token!)
			}
			pool.addStakedOutputTokenAmount(amount.times(BIGINT_MINUS_ONE))
		}
		sdk.Accounts.loadAccount(event.params.user)
	}
}
