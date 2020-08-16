#!/bin/bash

docker-compose down \
  --rmi local \
  "$@"

