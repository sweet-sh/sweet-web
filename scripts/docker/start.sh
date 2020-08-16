#!/bin/bash

docker-compose up \
  --build \
  --detach \
  "$@"

