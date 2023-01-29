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
	TokenSwap,
	L2_Amm,
	AddLiquidity,
	RemoveLiquidity,
	RemoveLiquidityOne,
} from '../../../../generated/HopL2Amm/L2_Amm'
import { Token } from '../../../../generated/schema'
import { getUsdPricePerToken, getUsdPrice } from '../../../../src/prices/index'
import { bigIntToBigDecimal } from '../../../../src/sdk/util/numbers'
import {
	BIGINT_TEN_TO_EIGHTEENTH,
	USDC_DENOMINATOR_BI,
} from '../../../../src/sdk/util/constants'

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

const genesisHashesDecimal6 = [
	'0x1aaddc57d3e9f4157728536f368c5d69a6be268e2258593efa592938395410a1', //USDT
	'0x03a61cb0acb761bee98a0a42718ab606f875d49d1bb694755e5d70cb9890d478', //USDC
]
const genesisHashesDecimal18 = [
	'0x9dab44e187e3bbbdfea0ca8cddea8ba78eb6f4d94a0725bc3c76ab5187d266e2', //ETH
	'0x0de91b478c4724233e3d83ae4f5ed4ecbf4b301b48dbc1ade42e0c6f6b66fc6b', //DAI
]
class TokenInit implements TokenInitializer {
	getTokenParams(address: Address): TokenParams {
		const tokenConfig = NetworkConfigs.getTokenDetails(address.toHex())
		const name = tokenConfig[1]
		const symbol = tokenConfig[0]
		const decimals = BigInt.fromString(tokenConfig[2]).toI32()
		return { name, symbol, decimals }
	}
}

export function handleTokenSwap(event: TokenSwap): void {
	if (NetworkConfigs.getPoolsList().includes(event.address.toHexString())) {
		const amount = event.params.tokensSold

		const bp = BigInt.fromString('4').div(BigInt.fromString('10000'))
		const fees = amount.times(bp)

		const inputToken = NetworkConfigs.getTokenAddressFromPoolAddress(
			event.address.toHexString()
		)
		const poolConfig = NetworkConfigs.getPoolDetails(
			event.address.toHexString()
		)

		const poolName = poolConfig[1]
		const poolSymbol = poolConfig[0]

		const sdk = new SDK(conf, new Pricer(), new TokenInit(), event)

		const pool = sdk.Pools.loadPool<string>(event.address)
		const token = sdk.Tokens.getOrCreateToken(Address.fromString(inputToken))
		sdk.Accounts.loadAccount(event.params.buyer)

		if (!pool.isInitialized) {
			pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token)
		}

		pool.addRevenueNative(BigInt.zero(), fees)
	}
}

export function handleAddLiquidity(event: AddLiquidity): void {
	if (NetworkConfigs.getPoolsList().includes(event.address.toHexString())) {
		let amount = event.params.tokenAmounts
		if (amount.length == 0) {
			return
		}
		const liquidity = amount[0].plus(amount[1])

		const inputToken = NetworkConfigs.getTokenAddressFromPoolAddress(
			event.address.toHexString()
		)
		const poolConfig = NetworkConfigs.getPoolDetails(
			event.address.toHexString()
		)

		const poolName = poolConfig[1]
		const poolSymbol = poolConfig[0]

		const sdk = new SDK(conf, new Pricer(), new TokenInit(), event)

		const pool = sdk.Pools.loadPool<string>(event.address)
		const token = sdk.Tokens.getOrCreateToken(Address.fromString(inputToken))
		const acc = sdk.Accounts.loadAccount(event.params.provider)

		if (!pool.isInitialized) {
			pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token)
		}

		if (
			genesisHashesDecimal6.includes(
				event.transaction.hash.toHexString().toLowerCase()
			)
		) {
			pool.setInputTokenBalance(
				event.params.lpTokenSupply.div(USDC_DENOMINATOR_BI)
			)
		}
		if (
			genesisHashesDecimal18.includes(
				event.transaction.hash.toHexString().toLowerCase()
			)
		) {
			pool.setInputTokenBalance(
				event.params.lpTokenSupply.div(BIGINT_TEN_TO_EIGHTEENTH)
			)
		}

		let val = L2_Amm.bind(event.address)

		let call = val.try_getVirtualPrice()
		let price: BigInt
		if (!call.reverted) {
			price = call.value
		} else {
			log.warning('Contract call reverted', [])
		}
		pool.setOutputTokenSupply(event.params.lpTokenSupply)
		pool.addRevenueNative(BigInt.zero(), event.params.fees[0])
		acc.liquidityDeposit(pool, liquidity, false)

		pool.setInputTokenBalance(
			event.params.lpTokenSupply.div(BIGINT_TEN_TO_EIGHTEENTH),
			false
		)
		pool.setTotalValueLocked(
			bigIntToBigDecimal(
				event.params.lpTokenSupply.times(price).div(BIGINT_TEN_TO_EIGHTEENTH)
			)
		)

		log.warning(
			`LA ${token.id.toHexString()} - lpTokenSupply: {}, amount: {}, hash: {},  tvl: {},  feeUsd: {}`,
			[
				bigIntToBigDecimal(event.params.lpTokenSupply).toString(),
				bigIntToBigDecimal(liquidity, 6).toString(),
				event.transaction.hash.toHexString(),
				event.params.lpTokenSupply.div(USDC_DENOMINATOR_BI).toString(),
				bigIntToBigDecimal(event.params.fees[0], 6).toString(),
			]
		)
	}
}
export function handleRemoveLiquidity(event: RemoveLiquidity): void {
	if (NetworkConfigs.getPoolsList().includes(event.address.toHexString())) {
		let amount = event.params.tokenAmounts
		if (amount.length == 0) {
			return
		}

		const liquidity = amount[0].plus(amount[1])

		const inputToken = NetworkConfigs.getTokenAddressFromPoolAddress(
			event.address.toHexString()
		)
		const poolConfig = NetworkConfigs.getPoolDetails(
			event.address.toHexString()
		)

		let val = L2_Amm.bind(event.address)

		let call = val.try_getVirtualPrice()
		let price: BigInt
		if (!call.reverted) {
			price = call.value
		} else {
			log.warning('Contract call reverted', [])
		}

		const poolName = poolConfig[1]
		const poolSymbol = poolConfig[0]

		const sdk = new SDK(conf, new Pricer(), new TokenInit(), event)

		const pool = sdk.Pools.loadPool<string>(event.address)
		const token = sdk.Tokens.getOrCreateToken(Address.fromString(inputToken))
		const acc = sdk.Accounts.loadAccount(event.params.provider)

		if (!pool.isInitialized) {
			pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token)
		}

		acc.liquidityWithdraw(pool, liquidity, false)
		pool.setInputTokenBalance(
			event.params.lpTokenSupply.div(BIGINT_TEN_TO_EIGHTEENTH),
			false
		)
		pool.setTotalValueLocked(
			bigIntToBigDecimal(
				event.params.lpTokenSupply.times(price).div(BIGINT_TEN_TO_EIGHTEENTH)
			)
		)
		pool.setOutputTokenSupply(event.params.lpTokenSupply)

		log.warning(
			'LWITH lpTokenSupply: {}, amount6-0: {}, amount18-0: {}, amount6-1: {}, amount18-1: {}, hash: {}',
			[
				bigIntToBigDecimal(event.params.lpTokenSupply).toString(),
				bigIntToBigDecimal(amount[0], 6).toString(),
				bigIntToBigDecimal(amount[0]).toString(),
				bigIntToBigDecimal(amount[1], 6).toString(),
				bigIntToBigDecimal(amount[1]).toString(),
				event.transaction.hash.toHexString(),
			]
		)
	}
}
export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
	if (NetworkConfigs.getPoolsList().includes(event.address.toHexString())) {
		log.warning('LWITHONE lpTokenSupply: {}, amount: {}, txHash: {}', [
			event.params.lpTokenSupply.toString(),
			event.transaction.hash.toHexString(),
			bigIntToBigDecimal(event.params.lpTokenAmount).toString(),
		])

		let tokenIndex = event.params.boughtId
		if (!tokenIndex.equals(BigInt.zero())) {
			return
		}

		let val = L2_Amm.bind(event.address)

		let call = val.try_getVirtualPrice()
		let price: BigInt
		if (!call.reverted) {
			price = call.value
		} else {
			log.warning('Contract call reverted', [])
		}

		const inputToken = NetworkConfigs.getTokenAddressFromPoolAddress(
			event.address.toHexString()
		)
		const poolConfig = NetworkConfigs.getPoolDetails(
			event.address.toHexString()
		)

		const poolName = poolConfig[0]
		const poolSymbol = poolConfig[1]

		const sdk = new SDK(conf, new Pricer(), new TokenInit(), event)

		const pool = sdk.Pools.loadPool<string>(event.address)
		const token = sdk.Tokens.getOrCreateToken(Address.fromString(inputToken))
		const acc = sdk.Accounts.loadAccount(event.params.provider)

		if (!pool.isInitialized) {
			pool.initialize(poolName, poolSymbol, BridgePoolType.LIQUIDITY, token)
		}

		acc.liquidityWithdraw(pool, event.params.lpTokenAmount, false)
		pool.setInputTokenBalance(
			event.params.lpTokenSupply.div(BIGINT_TEN_TO_EIGHTEENTH),
			false
		)
		pool.setTotalValueLocked(
			bigIntToBigDecimal(
				event.params.lpTokenSupply.times(price).div(BIGINT_TEN_TO_EIGHTEENTH)
			)
		)
		pool.setOutputTokenSupply(event.params.lpTokenSupply)

		log.warning(
			'LWITHONE lpTokenSupply: {}, amount: {}, txHash: {}, virtualPrice: {}, tvl: {}',
			[
				event.params.lpTokenSupply.toString(),
				bigIntToBigDecimal(event.params.lpTokenAmount).toString(),
				event.transaction.hash.toHexString(),
				price.toString(),
				bigIntToBigDecimal(event.params.lpTokenSupply.times(price)).toString(),
			]
		)
	}
}
