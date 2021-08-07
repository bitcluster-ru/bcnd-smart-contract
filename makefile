compile:
	npx hardhat compile
test:
	npx hardhat test
estimate-gas:
	REPORT_GAS=true npx hardhat test
coverage:
	npx hardhat coverage

.PHONY: compile test estimate-gas coverage
