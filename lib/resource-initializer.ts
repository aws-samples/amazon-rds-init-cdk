// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as ec2 from '@aws-cdk/aws-ec2'
import * as lambda from '@aws-cdk/aws-lambda'
import { Construct, Duration } from '@aws-cdk/core'
import { createHash } from 'crypto'
import { calculateFunctionHash } from '@aws-cdk/aws-lambda/lib/function-hash'
import { AwsCustomResource, AwsCustomResourcePolicy, AwsSdkCall, PhysicalResourceId } from '@aws-cdk/custom-resources'
import { RetentionDays } from '@aws-cdk/aws-logs'
import { PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam'

export interface CdkResourceInitializerProps {
  vpc: ec2.IVpc
  subnetsSelection: ec2.SubnetSelection
  fnSecurityGroups: ec2.ISecurityGroup[]
  fnTimeout: Duration
  fnCode: lambda.DockerImageCode
  fnLogRetention: RetentionDays
  fnMemorySize?: number
  config: any
}

export class CdkResourceInitializer extends Construct {
  public readonly response: string
  public readonly customResource: AwsCustomResource
  public readonly function: lambda.Function

  constructor (scope: Construct, id: string, props: CdkResourceInitializerProps) {
    super(scope, id)

    const fnSg = new ec2.SecurityGroup(this, 'ResourceInitializerFnSg', {
      securityGroupName: `${id}ResourceInitializerFnSg`,
      vpc: props.vpc,
      allowAllOutbound: true
    })

    const fn = new lambda.DockerImageFunction(this, 'ResourceInitializerFn', {
      memorySize: props.fnMemorySize || 128,
      functionName: `${id}ResourceInitializerFn`,
      code: props.fnCode,
      vpcSubnets: props.vpc.selectSubnets(props.subnetsSelection),
      vpc: props.vpc,
      securityGroups: [fnSg, ...props.fnSecurityGroups],
      timeout: props.fnTimeout,
      logRetention: props.fnLogRetention,
      allowAllOutbound: true
    })

    const payload: string = JSON.stringify({
      params: {
        config: props.config
      }
    })

    const physicalResIdHash = createHash('md5')
      .update(calculateFunctionHash(fn) + payload)
      .digest('hex')

    const sdkCall: AwsSdkCall = {
      service: 'Lambda',
      action: 'invoke',
      parameters: {
        FunctionName: fn.functionName,
        Payload: payload
      },
      physicalResourceId: PhysicalResourceId.of(`${id}-AwsSdkCall-${physicalResIdHash}`)
    }

    const role = new Role(this, 'AwsCustomResourceRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com')
    })

    // IMPORTANT: the AwsCustomResource construct deploys a singleton AWS Lambda function that is re-used across the same CDK Stack,
    // because it is intended to be re-used, make sure it has permissions to invoke multiple functions and it's timeout is sufficient.
    // @see: https://github.com/aws/aws-cdk/blob/cafe8257b777c2c6f6143553b147873d640c6745/packages/%40aws-cdk/custom-resources/lib/aws-custom-resource/aws-custom-resource.ts#L360
    role.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: ['lambda:InvokeFunction']
      })
    )
    this.customResource = new AwsCustomResource(this, 'AwsCustomResource', {
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
      onUpdate: sdkCall,
      timeout: Duration.minutes(10),
      role
    })

    this.response = this.customResource.getResponseField('Payload')

    this.function = fn
  }
}
