

export async function handle (state, action) {

	const caller = action.caller
	const input = action.input
	// SWC's state
	const templatesFactory = state.templatesFactory
	const fqrs = state.fqrs
	const deposits = state.deposits
	const withdrawals = state.withdrawals
	const balances = state.balances

	// SWC's owner/deployer
	const SWCID = SmartWeave.contract.id
	// CONSTANTS:
	// test token SWCID
	const FCP = "FdY68iYqTvA40U34aXQBBYseGmIUmLV-u57bT7LZWm0"
	const generatingFee = 0.0001
	const updatingFee = 0.00005
	// List of Errors
	const ERROR_INVALID_CALLER = `the caller is an unauthorised address`;
	const ERROR_INVALID_OPTIONS = `the "options" has not an "Object" type`;
	const ERROR_DATA_TYPE_UNSUPPORTED = `the provided primitive type is not supported`;
	const ERROR_INVALID_LENGTH = `options entries count exceed the limits`;
	const ERROR_DUPLICATED_TX = `this transaction's deposit has been already reflected`;
	const ERROR_INVALID_DEPOSITOR = `the function's caller is not the deposit TXID owner`;
	const ERROR_INVALID_DEPOSIT_TX = `the provided deposit transaction is not valid`;
	const ERROR_MISSING_REQUIRED_TAG = `missing a required tag "Input" in the deposit TX`;
	const ERROR_MISSING_INPUT_PROPOERTY = `missing a reuired Input's key`;
	const ERROR_WRONG_FCP_FUNCTION = `deposit's function must be a "transfer"`;
	const ERROR_INVALID_TARGET = `deposit's TX target must be equal to this contract ID`;
	const ERROR_CALLER_NOT_REGISTERED = `the caller has not deposited before`;
	const ERROR_NOT_INTEGER = `only ineteger values are allowed`;
	const ERROR_AMOUNT_TOO_HIGH = `the withdrawal qty is higher than the caller's balance`;
	const ERROR_INVALID_WITHDRAWAL_AMOUNT = `only positive, non-zero integers are allowed`;
	const ERROR_INVALID_INDEX = `the provided index is out of range`;
	const ERROR_INVALID_METDATA = `metadata and allowed types are not identical`;



	// SWC' executable functions

	if (input.function === "createTemplate") {
		const options = input.options

		await _validateCaller(caller);
		_validateOptions(options);
		_validateDataTypes(options);
		_validateObjectEntriesLength(options);


		templatesFactory.push(options)

		return { state }
	}

	if (input.function === "deposit") {
		const tx = input.tx
		// only the SWC deployer can deposit and withdraw
		await _validateCaller(caller)
		await _validateDepositTransaction(tx, caller);
		const depositQty = await _getDepositQty(tx);

		if (! balances[caller]) {
			balances[caller] = 0
		};

		balances[caller] += depositQty
		deposits.push(tx)

		return { state }

	}

	if (input.function === "withdraw") {
		const qty = input.qty

		await _validateCaller(caller)

		if (! balances[caller]) {
			throw new ContractError(ERROR_CALLER_NOT_REGISTERED)
		};

		_validateWithdrawQty(qty);

		balances[caller] -= qty

	    const invocation = {
	      function: "transfer",
	      target: caller,
	      qty: qty
	    };

	    state.foreignCalls.push({
	      contract: FCP,
	      input: invocation
	    });

	    withdrawals.push(SmartWeave.transaction.id)

    	return { state }

	}

	if (input.function === "createCode") {
		const templateIndex = input.templateIndex
		const metadata = input.metadata

		_validateInteger(templateIndex, true)
		_validateCaller(caller)


		if (! templatesFactory[templateIndex]) {
			throw new ContractError(ERROR_INVALID_INDEX)
		}

		const template = templatesFactory[templateIndex]
		_validateTemplateMetadata(template, metadata);

		if ( (! balances[caller]) || (balances[caller] <= generatingFee) ) {
			throw new ContractError(ERROR_AMOUNT_TOO_HIGH)
		}

		balances[caller] -= generatingFee

		fqrs.push({
			id: SmartWeave.transaction.id,
			template: templateIndex,
			data: _generatefqr(template, metadata),
			logs: [SmartWeave.transaction.id]
		});

		return { state }
	}

	if (input.function === "updateCode") {
		const metadata = input.metadata
		const templateIndex = input.templateIndex
		const fqrIndex = input.fqrIndex

		await _validateCaller(caller)
		_validateInteger(templateIndex, true)
		_validateInteger(fqrIndex, true)

		if (! templatesFactory[templateIndex]) {
			throw new ContractError(ERROR_INVALID_INDEX)
		}

		if ( (! fqrs[fqrIndex]) || (fqrs[fqrIndex]["template"] !== templateIndex) ) {
			throw new ContractError(ERROR_INVALID_INDEX)
		}

		if ( (! balances[caller]) || (balances[caller] <= updatingFee) ) {
			throw new ContractError(ERROR_AMOUNT_TOO_HIGH)
		}

		const template = templatesFactory[templateIndex]
		_validateTemplateMetadata(template, metadata);

		fqrs[fqrIndex]["data"] = _generatefqr(template, metadata)
		fqrs[fqrIndex]["logs"].push(SmartWeave.transaction.id)
		balances[caller] -= updatingFee

		return { state }

	}

	// HELPER FUNCTIONS:

	function _validateInteger(number, allowNull) {

		if ( typeof allowNull === "undefined" ) {
			throw new ContractError(`ERROR_REQUIRED_ARGUMENT`)
		}

		if (! Number.isInteger(number) ) {
			throw new ContractError(`ERROR_INVALID_NUMBER_TYPE`)
		}

		if (allowNull) {
			if (number < 0) {
				throw new ContractError(`ERROR_NEGATIVE_INTEGER`)
			}
		} else if (number <= 0) {
			throw new ContractError(`ERROR_INVALID_NUMBER_TYPE`)
		}
	}

	async function _getContractOwner(tx) {
		const txObject = await SmartWeave.unsafeClient.transactions.get(tx)
		const owner = txObject["owner"]
		const callerAddress = await SmartWeave.unsafeClient.wallets.ownerToAddress(owner)

		// return owner public address
		return callerAddress
	};

	async function _validateCaller(address) {

		const contractOwner = await _getContractOwner(SWCID)
		if ( address !== contractOwner) {
			throw new ContractError(ERROR_INVALID_CALLER)
		}

	};

	function _validateOptions(arrays) {

		if (Object.prototype.toString.call(arrays) !== "[object Array]") {
			throw new ContractError(ERROR_INVALID_OPTIONS)
		}
	};

	function _validateDataTypes(arrays) {
		const whitelisted = ["string", "number", "boolean"]

		for (let array of arrays) {

			if (! whitelisted.includes(array[1]) ) {
				throw new ContractError(ERROR_DATA_TYPE_UNSUPPORTED)
			}
		}
	};

	function _validateObjectEntriesLength(arrays) {

		const len = arrays.length
		// max nb of entries is 20
		if (  len <= 0 || len > 20 ) {
			throw new ContractError(ERROR_INVALID_LENGTH)
		}
	};

	async function _validateDepositTransaction(txid, address) {

		if ( deposits.includes(txid) ) {
			throw new ContractError(ERROR_DUPLICATED_TX)
		}

		const txObject = await SmartWeave.unsafeClient.transactions.get(txid)
		const txOwner = txObject["owner"]
		const ownerAddress = await SmartWeave.unsafeClient.wallets.ownerToAddress(txOwner)

		if (ownerAddress !== address) {
			throw new ContractError(ERROR_INVALID_DEPOSITOR)
		}

		const fcpTxsValidation = await SmartWeave.contracts.readContractState(FCP, undefined, true)
		const validity = fcpTxsValidation.validity

		if (! validity[txid] ) {
			throw new ContractError(ERROR_INVALID_DEPOSIT_TX)
		}
	}

	async function _getDepositQty(txid) {

		const tagsMap = new Map();

		const depositTransactionObject = await SmartWeave.unsafeClient.transactions.get(txid);
	    const depositTransactionTags = depositTransactionObject.get("tags");

	    for (let tag of depositTransactionTags) {
	      const key = tag.get("name", {decode: true, string: true})
	      const value = tag.get("value", {decode: true, string: true})
	      tagsMap.set(key, value)
	    }

	    if (! tagsMap.has("Input")) {
	      throw new ContractError(ERROR_MISSING_REQUIRED_TAG)
	    }

	    const inputObject = JSON.parse( tagsMap.get("Input") )
	    const inputsMap = new Map( Object.entries(inputObject) )

	    if (! inputsMap.has("qty")) {
	      throw new ContractError(ERROR_MISSING_INPUT_PROPOERTY)
	    }

	    if (! inputsMap.has("function") ) {
	    	throw new ContractError(ERROR_MISSING_INPUT_PROPOERTY)
	    }

	    if (inputsMap.get("function") !== "transfer") {
	      throw new ContractError(ERROR_WRONG_FCP_FUNCTION)
	    }

	    if (inputsMap.get("target") !== SmartWeave.contract.id) {
	      throw new ContractError(ERROR_INVALID_TARGET)
	    }

	    return inputsMap.get("qty")

	};

	function _validateWithdrawQty(qty) {

		if (! Number.isInteger(qty) ) {
			throw new ContractError(ERROR_NOT_INTEGER)
		}

		if (qty > balances[caller]) {
			throw new ContractError(ERROR_AMOUNT_TOO_HIGH)
		}

		if (qty <= 0) {
			throw new ContractError(ERROR_INVALID_WITHDRAWAL_AMOUNT)
		}
	}

	function _validateTemplateMetadata(template, metadata) {

		if (metadata.length !== template.length) {
			throw new ContractError(ERROR_INVALID_LENGTH)
		}

		const typesOfMetadata = metadata.map(entry => typeof entry)
		const templateAllowedTypes = template.map(valueTypePair => valueTypePair[1] )

		if (JSON.stringify(typesOfMetadata) !== JSON.stringify(templateAllowedTypes) ) {
			throw new ContractError(ERROR_INVALID_METDATA)
		}
	}

	function _generatefqr(template, metadata) {

		const keys = template.map(valueTypePair => valueTypePair[0])
		const data = metadata.map( (value, index) => ( [keys[index], value] ) )
		return data


	}

}

