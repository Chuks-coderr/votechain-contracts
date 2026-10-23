# Issue #26 backend API implementation status

Issue #26 is ready for implementation once its stated dependencies are
available. The current API crate has an in-memory `Indexer` model and a set of
query handlers in `api/src/api.rs`, but `api/src/main.rs` still registers stub
handlers.

The repository does not currently provide the inputs needed to implement the
write routes safely:

- no indexer database connection or schema integration is exposed to the API;
- no Stellar RPC/Horizon client or Soroban transaction builder is configured;
- no wallet signing or server-side transaction submission contract is defined;
- no API integration-test fixture exists for successful and failed submissions.

Replacing the stubs with fabricated hashes or static in-memory responses would
make the API appear successful while not creating an on-chain transaction.
Once the indexer schema (#44) and Stellar SDK integration are available, this
branch can be extended with the real query and submission services, structured
errors, and route integration tests.