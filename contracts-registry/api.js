export async function handle (state, action) {

	const caller = action.caller
	const input = action.input

	// STATE
	const verifiedGenerators = state.verifiedGenerators
	const delegates = state.delegates
	// ERRORS
	const ERROR_INVALID_ARWEAVE_ADDRESS = `the provided string is not a valid Arweave address`;
	const ERROR_INVALID_CALLER = `the function has been executed by an unauthorised address`;
	const ERROR_ADDRESS_DUPLICATED = `the given address has been already added`;
	const ERROR_CALLER_NOT_DELEGATED = `contract owner is not delegated to perform this action`;

	if (input.function === "isVerified") {
		const address = input.address

		_validateAddress(address)

		if (! verifiedGenerators.includes(address)) {
			return { result: {isVerified: false}}
		}

		return { result: {isVerified: true} }
	}

	if (input.function === "addGenerator") {
		const address = input.address

		await _validateCaller(caller);
		_validateAddress(address)

		if (! verifiedGenerators.includes(address) ) {
			verifiedGenerators.push(address)
			return { state }
		}

		throw new ContractError(ERROR_ADDRESS_DUPLICATED)
	}

	if (input.function === "removeGenerator") {
		const address = input.address

		_validateAddress(address);

		if (delegates.includes(address) ) {

			const genIndex = verifiedGenerators.indexOf(address)
			verifiedGenerators.splice(genIndex, 1)

			return { state }
		}

		throw new ContractError(ERROR_CALLER_NOT_DELEGATED)
	}

	if (input.function === "delegate") {

		if (! verifiedGenerators.includes(caller)) {
			throw new ContractError(ERROR_INVALID_CALLER)
		}

		if (! delegates.includes(caller)) {
			delegates.push(caller)
		}

		throw new ContractError(ERROR_ADDRESS_DUPLICATED)
	}

	// HELPER FUNCTIONS
	function _validateAddress(address) {
		if (typeof address !== "string" || address.length !== 43) {
			throw new ContractError(ERROR_INVALID_ARWEAVE_ADDRESS)
		}
	};

	async function _validateCaller(address) {
		const SWCID = SmartWeave.contract.id 

		const contractCreationTxObject = await SmartWeave.unsafeClient.transactions.get(SWCID)
		const owner = contractCreationTxObject["owner"]
		const ownerAddress = await SmartWeave.unsafeClient.wallets.ownerToAddress(owner)

		if (ownerAddress !== address) {
			throw new ContractError(ERROR_INVALID_CALLER)
		}
	};


}

