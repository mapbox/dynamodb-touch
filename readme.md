# dynamodb-touch

Simulated DynamoDB Stream events based on the contents of a DynamoDB table.

## What it does

Performs either a GetItem, Query, or Scan operation on a DynamoDB table, then
passes each resulting record into a Kinesis stream in a wrapper identical to
what would be provided by a DynamoDB stream `INSERT` event.
