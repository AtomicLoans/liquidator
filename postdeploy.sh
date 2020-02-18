#!/bin/sh

./bin/atomicagent-migrate > migrate.log && ./bin/atomicagent-worker > worker.log 2>&1 & ./bin/atomicagent-api > api.log 2>&1
