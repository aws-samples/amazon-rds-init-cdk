// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const mysql = require('mysql')
const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')

const secrets = new AWS.SecretsManager({})

exports.handler = async (e) => {
  try {
    const { config } = e.params
    const { password, username, host } = await getSecretValue(config.credsSecretName)
    const connection = mysql.createConnection({
      host,
      user: username,
      password,
      multipleStatements: true
    })

    connection.connect()

    const sqlScript = fs.readFileSync(path.join(__dirname, 'script.sql')).toString()
    const res = await query(connection, sqlScript)

    return {
      status: 'OK',
      results: res
    }
  } catch (err) {
    return {
      status: 'ERROR',
      err,
      message: err.message
    }
  }
}

function query (connection, sql) {
  return new Promise((resolve, reject) => {
    connection.query(sql, (error, res) => {
      if (error) return reject(error)

      return resolve(res)
    })
  })
}

function getSecretValue (secretId) {
  return new Promise((resolve, reject) => {
    secrets.getSecretValue({ SecretId: secretId }, (err, data) => {
      if (err) return reject(err)

      return resolve(JSON.parse(data.SecretString))
    })
  })
}
