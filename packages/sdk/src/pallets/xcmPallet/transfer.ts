// Contains basic call formatting for different XCM Palletss

import {
  type Extrinsic,
  type TSerializedApiCall,
  type TRelayToParaOptions,
  type TRelayToParaCommonOptions,
  type TSendOptionsCommon,
  type TSendOptions,
  type TNode
} from '../../types'
import {
  getNode,
  callPolkadotJsTxFunction,
  createApiInstanceForNode,
  determineRelayChain
} from '../../utils'
import { getRelayChainSymbol, hasSupportForAsset } from '../assets'
import { getAssetBySymbolOrId } from '../assets/assetsUtils'
import { InvalidCurrencyError } from '../../errors/InvalidCurrencyError'
import { IncompatibleNodesError } from '../../errors'
import { checkKeepAlive } from './keepAlive'
import { resolveTNodeFromMultiLocation } from './utils'

const sendCommon = async (options: TSendOptionsCommon): Promise<Extrinsic | TSerializedApiCall> => {
  const {
    api,
    origin,
    currency,
    amount,
    address,
    destination,
    paraIdTo,
    destApiForKeepAlive,
    serializedApiCallEnabled = false
  } = options

  if (typeof currency === 'number' && currency > Number.MAX_SAFE_INTEGER) {
    throw new InvalidCurrencyError(
      'The provided asset ID is larger than the maximum safe integer value. Please provide it as a string.'
    )
  }

  const asset = getAssetBySymbolOrId(origin, currency)

  const isMultiLocationDestination = typeof destination === 'object'
  const isMultiLocationCurrency = typeof currency === 'object'

  if (destination !== undefined && !isMultiLocationDestination) {
    const originRelayChainSymbol = getRelayChainSymbol(origin)
    const destinationRelayChainSymbol = getRelayChainSymbol(destination)
    if (originRelayChainSymbol !== destinationRelayChainSymbol) {
      throw new IncompatibleNodesError()
    }
  }

  const originNode = getNode(origin)

  const assetCheckEnabled =
    destination === 'AssetHubKusama' ||
    destination === 'AssetHubPolkadot' ||
    isMultiLocationCurrency
      ? false
      : originNode.assetCheckEnabled

  if (asset === null && assetCheckEnabled) {
    throw new InvalidCurrencyError(
      `Origin node ${origin} does not support currency or currencyId ${JSON.stringify(currency)}.`
    )
  }

  if (
    destination !== undefined &&
    !isMultiLocationDestination &&
    asset?.symbol !== undefined &&
    assetCheckEnabled &&
    !hasSupportForAsset(destination, asset.symbol)
  ) {
    throw new InvalidCurrencyError(
      `Destination node ${destination} does not support currency or currencyId ${JSON.stringify(currency)}.`
    )
  }

  const apiWithFallback = api ?? (await createApiInstanceForNode(origin))

  const amountStr = amount.toString()

  if (typeof currency === 'object') {
    console.warn('Keep alive check is not supported when using MultiLocation as currency.')
  } else if (typeof address === 'object') {
    console.warn('Keep alive check is not supported when using MultiLocation as address.')
  } else if (typeof destination === 'object') {
    console.warn('Keep alive check is not supported when using MultiLocation as destination.')
  } else {
    await checkKeepAlive({
      originApi: apiWithFallback,
      address,
      amount: amountStr,
      originNode: origin,
      destApi: destApiForKeepAlive,
      currencySymbol: asset?.symbol ?? currency.toString(),
      destNode: destination
    })
  }

  const currencyStr = typeof currency === 'object' ? undefined : currency.toString()
  const currencyId = assetCheckEnabled ? asset?.assetId : currencyStr

  return originNode.transfer({
    api: apiWithFallback,
    currencySymbol: asset?.symbol,
    currencyId,
    amount: amountStr,
    address,
    destination,
    paraIdTo,
    overridedCurrencyMultiLocation: typeof currency === 'object' ? currency : undefined,
    serializedApiCallEnabled
  })
}

export const sendSerializedApiCall = async (options: TSendOptions): Promise<TSerializedApiCall> => {
  return (await sendCommon({
    ...options,
    serializedApiCallEnabled: true
  })) as TSerializedApiCall
}

export const send = async (options: TSendOptions): Promise<Extrinsic> => {
  return (await sendCommon(options)) as Extrinsic
}

export const transferRelayToParaCommon = async (
  options: TRelayToParaCommonOptions
): Promise<Extrinsic | TSerializedApiCall | never> => {
  const {
    api,
    destination,
    amount,
    address,
    paraIdTo,
    destApiForKeepAlive,
    serializedApiCallEnabled = false
  } = options
  const isMultiLocationDestination = typeof destination === 'object'
  const isAddressMultiLocation = typeof address === 'object'

  if (api === undefined && isMultiLocationDestination) {
    throw new Error('API is required when using MultiLocation as destination.')
  }

  const apiWithFallback =
    api ?? (await createApiInstanceForNode(determineRelayChain(destination as TNode)))

  const amountStr = amount.toString()

  if (isMultiLocationDestination) {
    console.warn('Keep alive check is not supported when using MultiLocation as destination.')
  } else if (isAddressMultiLocation) {
    console.warn('Keep alive check is not supported when using MultiLocation as address.')
  } else {
    await checkKeepAlive({
      originApi: apiWithFallback,
      address,
      amount: amountStr,
      destApi: destApiForKeepAlive,
      currencySymbol: getRelayChainSymbol(destination),
      destNode: destination
    })
  }

  const serializedApiCall = getNode(
    isMultiLocationDestination ? resolveTNodeFromMultiLocation(destination) : destination
  ).transferRelayToPara({
    api: apiWithFallback,
    destination,
    address,
    amount: amountStr,
    paraIdTo,
    destApiForKeepAlive
  })

  if (serializedApiCallEnabled) {
    return serializedApiCall
  }

  return callPolkadotJsTxFunction(apiWithFallback, serializedApiCall)
}

export const transferRelayToPara = async (
  options: TRelayToParaOptions
): Promise<Extrinsic | never> => {
  return (await transferRelayToParaCommon(options)) as Extrinsic | never
}

export const transferRelayToParaSerializedApiCall = async (
  options: TRelayToParaOptions
): Promise<TSerializedApiCall> => {
  return (await transferRelayToParaCommon({
    ...options,
    serializedApiCallEnabled: true
  })) as TSerializedApiCall
}
