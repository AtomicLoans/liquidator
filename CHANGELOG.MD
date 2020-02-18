## [0.1.55](https://github.com/AtomicLoans/agent/compare/v0.1.54...v0.1.55) - 2020-02-11

- Add asset variable to emails

## [0.1.54](https://github.com/AtomicLoans/agent/compare/v0.1.53...v0.1.54) - 2020-02-10

- Verify deposit transactions
- Update Kovan arbiter endpoint
- Add auto-reconnect to mongoose

## [0.1.53](https://github.com/AtomicLoans/agent/compare/v0.1.52...v0.1.53) - 2020-02-02

- Add live collateral values per loan and markets apis
- Add min collateral values to loan apis

## [0.1.52](https://github.com/AtomicLoans/agent/compare/v0.1.51...v0.1.52) - 2020-01-28

- Setup containerization
- Update kovan addresses which fixes Min Seizable Collateral calculation [atomicloans-eth-contracts/pull/117](https://github.com/AtomicLoans/atomicloans-eth-contracts/pull/117)
- Fix migrate-mongo

## [0.1.51](https://github.com/AtomicLoans/agent/compare/v0.1.50...v0.1.51) - 2020-01-15

- Fix issue with fund withdraw route syntax

## [0.1.50](https://github.com/AtomicLoans/agent/compare/v0.1.49...v0.1.50) - 2020-01-15

- Fix fund withdraw route not specifying currency

## [0.1.49](https://github.com/AtomicLoans/agent/compare/v0.1.48...v0.1.49) - 2020-01-15

- Update kovan contract addresses

## [0.1.48](https://github.com/AtomicLoans/agent/compare/v0.1.47...v0.1.48) - 2020-01-14

- Fix worker imports

## [0.1.47](https://github.com/AtomicLoans/agent/compare/v0.1.46...v0.1.47) - 2020-01-14

- Update npm packages

## [0.1.46](https://github.com/AtomicLoans/agent/compare/v0.1.45...v0.1.46) - 2020-01-14

- Set Travis CI
- Add opt in email notifications to Arbiter
- Improve tests for Funds, Loans, and Sales contracts

## [0.1.45](https://github.com/AtomicLoans/agent/compare/v0.1.44...v0.1.45) - 2020-01-04

- Update Kovan Contract Addresses

## [0.1.44](https://github.com/AtomicLoans/agent/compare/v0.1.43...v0.1.44) - 2019-12-10

- Ensure loan updates when Tx reverted by EVM

## [0.1.43](https://github.com/AtomicLoans/agent/compare/v0.1.42...v0.1.43) - 2019-12-10

- Add Tx error case for being reverted by EVM

## [0.1.42](https://github.com/AtomicLoans/agent/compare/v0.1.41...v0.1.42) - 2019-12-08

- Add DAI market for Mainnet

## [0.1.41](https://github.com/AtomicLoans/agent/compare/v0.1.40...v0.1.41) - 2019-12-07

- Add DAI market for Kovan

## [0.1.40](https://github.com/AtomicLoans/agent/compare/v0.1.39...v0.1.40) - 2019-12-06

- Fix issue with failed transaction overwriting query ordering

## [0.1.39](https://github.com/AtomicLoans/agent/compare/v0.1.38...v0.1.39) - 2019-12-05

- Add route for resetting transactions

## [0.1.38](https://github.com/AtomicLoans/agent/compare/v0.1.37...v0.1.38) - 2019-12-05

- Add route for eth txs (/api/loan/txs)

## [0.1.37](https://github.com/AtomicLoans/agent/compare/v0.1.36...v0.1.37) - 2019-12-05

- Create job for sanitizing transactions

## [0.1.36](https://github.com/AtomicLoans/agent/compare/v0.1.35...v0.1.36) - 2019-12-04

- Set minimum tx fee to 5 gwei

## [0.1.35](https://github.com/AtomicLoans/agent/compare/v0.1.34...v0.1.35) - 2019-12-04

- Improve error handling of transaction underpriced

## [0.1.34](https://github.com/AtomicLoans/agent/compare/v0.1.33...v0.1.34) - 2019-11-27

- Ensure tx evm failure resolves in instance status failed

## [0.1.33](https://github.com/AtomicLoans/agent/compare/v0.1.32...v0.1.33) - 2019-11-27

- Bump minimum lender agent to 0.1.31

## [0.1.32](https://github.com/AtomicLoans/agent/compare/v0.1.31...v0.1.32) - 2019-11-27

- Remove unnecessary migrate

## [0.1.31](https://github.com/AtomicLoans/agent/compare/v0.1.30...v0.1.31) - 2019-11-27

- Move MongoDB migrations agent startup

## [0.1.30](https://github.com/AtomicLoans/agent/compare/v0.1.29...v0.1.30) - 2019-11-27

- Bump Migrate Mongo package

## [0.1.29](https://github.com/AtomicLoans/agent/compare/v0.1.28...v0.1.29) - 2019-11-27

- Remove unnecessary increase connection for MongoDB

## [0.1.28](https://github.com/AtomicLoans/agent/compare/v0.1.27...v0.1.28) - 2019-11-27

- Add migrations to background job

## [0.1.27](https://github.com/AtomicLoans/agent/compare/v0.1.26...v0.1.27) - 2019-11-27

- Add timeout for connect and socket to avoid MongoTimeoutError

## [0.1.26](https://github.com/AtomicLoans/agent/compare/v0.1.25...v0.1.26) - 2019-11-27

- Remove MongoDB deprecation warning for migrations

## [0.1.25](https://github.com/AtomicLoans/agent/compare/v0.1.24...v0.1.25) - 2019-11-26

- Fix [MongoDB connection timeout](https://github.com/Automattic/mongoose/issues/8180)

## [0.1.24](https://github.com/AtomicLoans/agent/compare/v0.1.23...v0.1.24) - 2019-11-26

- Add improved error handling
- Migrate [DAI to SAI](https://blog.makerdao.com/single-collateral-dai-to-multi-collateral-dai-upgrade-timeline-and-actions/)

## [0.1.23](https://github.com/AtomicLoans/agent/compare/v0.1.22...v0.1.23) - 2019-10-24

- Enable agent to work in single api and worker process

## [0.1.22](https://github.com/AtomicLoans/agent/compare/v0.1.21...v0.1.22) - 2019-10-23

- Increase cancel expiration to 24 hours

## [0.1.21](https://github.com/AtomicLoans/agent/compare/v0.1.20...v0.1.21) - 2019-10-23

- Ensure Agent cancels loan if not withdrawn within 3 hours of request
- Add version of agent to agent info route

## [0.1.20](https://github.com/AtomicLoans/agent/compare/v0.1.19...v0.1.20) - 2019-10-21

- Add ability to update loan fund through agent
- Fix loan fund supplied calculation issues

## [0.1.19](https://github.com/AtomicLoans/agent/compare/v0.1.18...v0.1.19) - 2019-10-18

- Set max gas limit for all transactions

## [0.1.18](https://github.com/AtomicLoans/agent/compare/v0.1.17...v0.1.18) - 2019-10-18

- Reduce maximum gas limit

## [0.1.17](https://github.com/AtomicLoans/agent/compare/v0.1.16...v0.1.17) - 2019-10-17

- Fix rounding issues with liquidation

## [0.1.16](https://github.com/AtomicLoans/agent/compare/v0.1.15...v0.1.16) - 2019-10-17

- Improve logging for liquidation

## [0.1.15](https://github.com/AtomicLoans/agent/compare/v0.1.14...v0.1.15) - 2019-10-16

- Add ability to repopulate Liquidation data after resetting an Agent
- Improve handling of case where loan is approved but not withdrawn (should cancel loan after 3 hours of request)

## [0.1.14](https://github.com/AtomicLoans/agent/compare/v0.1.13...v0.1.14) - 2019-10-16

- Improve handling of transactions with same nonce in queue

## [0.1.13](https://github.com/AtomicLoans/agent/compare/v0.1.12...v0.1.13) - 2019-10-15

- Improve handling of replacing failed transactions

## [0.1.12](https://github.com/AtomicLoans/agent/compare/v0.1.11...v0.1.12) - 2019-10-15

- Improve error handling for web3 transactions

## [0.1.11](https://github.com/AtomicLoans/agent/compare/v0.1.10...v0.1.11) - 2019-10-15

- Fix typo with transaction error handling

## [0.1.10](https://github.com/AtomicLoans/agent/compare/v0.1.9...v0.1.10) - 2019-10-15

- Add handling of transactions with insufficient balance

## [0.1.9](https://github.com/AtomicLoans/agent/compare/v0.1.8...v0.1.9) - 2019-10-15

- Add handling of transactions that have timed out

## [0.1.8](https://github.com/AtomicLoans/agent/compare/v0.1.7...v0.1.8) - 2019-10-15

- add agent version endpoint
- add signature verication for update endpoint
- improve block timestamp query

## [0.1.7](https://github.com/AtomicLoans/agent/compare/v0.1.6...v0.1.7) - 2019-10-13

- add basic update with heroku

## [0.1.6](https://github.com/AtomicLoans/agent/compare/v0.1.5...v0.1.6) - 2019-10-13

- improve updating process with tmp folder

## [0.1.5](https://github.com/AtomicLoans/agent/compare/v0.1.4...v0.1.5) - 2019-10-13

- add preliminary agent updating

## 0.1.4 - 2019-10-13

- initial version
