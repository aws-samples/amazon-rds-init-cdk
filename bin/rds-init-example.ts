#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from '@aws-cdk/core'
import { RdsInitStackExample } from '../demos/rds-init-example'

const app = new cdk.App()

/* eslint no-new: 0 */
new RdsInitStackExample(app, 'RdsInitExample')
