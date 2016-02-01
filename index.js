var Dyno = require('dyno');
var crypto = require('crypto');
var stream = require('stream');
var Locking = require('locking');

module.exports.one = one;
module.exports.thisOne = thisOne;
module.exports.some = some;
module.exports.every = every;

function one(key, clients, callback) {
  describe(clients.dyno, function(err, tableData) {
    if (err) return callback(err);

    var writer = WriteStream(tableData.schema, tableData.table, clients.kinesis)
      .on('error', callback)
      .on('finish', callback);

    clients.dyno.getItem({ Key: key }, function(err, data) {
      if (err) return callback(err);
      writer.write(data.Item);
      writer.end();
    });
  });
}

function thisOne(item, clients, callback) {
  describe(clients.dyno, function(err, tableData) {
    var writer = WriteStream(tableData.schema, tableData.table, clients.kinesis)
      .on('error', callback)
      .on('finish', callback);
    writer.write(item);
    writer.end();
  });
}

function some(query, clients, callback) {
  var queryStream = clients.dyno.queryStream(query);

  describe(clients.dyno, function(err, tableData) {
    if (err) return callback(err);

    queryStream
        .on('error', callback)
      .pipe(WriteStream(tableData.schema, tableData.table, clients.kinesis))
        .on('error', callback)
        .on('finish', callback);
  });

  return queryStream;
}

function every(clients, callback) {
  var scanStream = clients.dyno.scanStream();

  describe(clients.dyno, function(err, tableData) {
    if (err) return callback(err);

    scanStream
        .on('error', callback)
      .pipe(WriteStream(tableData.schema, tableData.table, clients.kinesis))
        .on('error', callback)
        .on('finish', callback);
  });

  return scanStream;
}

var describeTable = Locking(function(dynoConfig, callback) {
  var dyno = Dyno(dynoConfig);
  dyno.describeTable({}, function(err, data) {
    if (err) return callback(err);

    callback(null, {
      table: data.Table.TableArn,
      schema: data.Table.KeySchema
    });
  });
});

function describe(dyno, callback) {
  var config = JSON.parse(JSON.stringify(dyno.config));
  config.table = dyno.config.params.TableName;
  describeTable(config, callback);
}

function WriteStream(schema, tableArn, kinesis) {
  var writeStream = new stream.Writable({
    highWaterMark: 100,
    objectMode: true
  });

  writeStream._buffer = [];

  writeStream._write = function(item, enc, callback) {
    var record = {
      eventId: '0',
      eventVersion: '1.0',
      eventName: 'INSERT',
      awsRegion: tableArn.split(':')[3],
      eventSourceARN: tableArn + '/dynamodb-touch',
      eventSource: 'dynamodb-touch',
      dynamodb: {
        Keys: JSON.parse(Dyno.serialize(schema.reduce(function(keys, key) {
          keys[key.AttributeName] = item[key.AttributeName];
          return keys;
        }, {}))),
        NewImage: JSON.parse(Dyno.serialize(item)),
        StreamViewType: 'NEW_IMAGE',
        SequenceNumber: '0'
      }
    };

    record.dynamodb.SizeBytes = (new Buffer(JSON.stringify(record.dynamodb.NewImage))).length;

    writeStream._buffer.push({
      Data: JSON.stringify(record),
      PartitionKey: crypto.createHash('md5').update(JSON.stringify(record.dynamodb.Keys)).digest('hex')
    });

    if (writeStream._buffer.length < 500) callback();
    else writeStream._push(callback);
  };

  writeStream._push = function(callback) {
    kinesis.putRecords({ Records: writeStream._buffer }, function(err) {
      if (err) return callback(err);
      writeStream._buffer = [];
      callback();
    });
  };

  var end = writeStream.end.bind(writeStream);
  writeStream.end = function(item, enc, callback) {
    if (!item) return done();

    writeStream._write(item, null, function(err) {
      if (err) writeStream.emit('error', err);
      done();
    });

    function done() {
      if (!writeStream._buffer.length)
        return end(null, null, callback);

      writeStream._push(function(err) {
        if (err) return writeStream.emit('error', err);
        end(null, null, callback);
      });
    }
  };

  return writeStream;
}
