const React = require('react')

class App extends React.Component {
  render () {
    var initScript = `
      const erc20ABI = [
        {
          "constant": true,
          "inputs": [
              {
                  "name": "_owner",
                  "type": "address"
              }
          ],
          "name": "balanceOf",
          "outputs": [
              {
                  "name": "balance",
                  "type": "uint256"
              }
          ],
          "payable": false,
          "stateMutability": "view",
          "type": "function"
        }
      ]

      window.ethereum.enable().then(() => {
        const currentTime = Math.floor(new Date().getTime() / 1000)

        var xmlhttp = new XMLHttpRequest()
        var theUrl = "/api/loan/agentinfo/ticker/USDC/BTC"
        xmlhttp.open("GET", theUrl)
        xmlhttp.send()
        xmlhttp.onload = function() {
          if (xmlhttp.status === 200) {
            const response = JSON.parse(xmlhttp.responseText)
            const liquidatorAddress = response.principalAddress
            const liquidatorCollateralAddress = response.collateralAddress
            console.log('liquidatorAddress', liquidatorAddress)

            document.getElementById("liquidator-address").innerHTML = liquidatorAddress
            document.getElementById("liquidator-btc-receive-address").innerHTML = liquidatorCollateralAddress

            web3.eth.getAccounts((err, res) => {                   
              const address = web3.toChecksumAddress(res[0])
              const message = 'Get Mnemonic for ' + address + ' at ' + currentTime
              console.log('address', address)
    
              web3.eth.getBalance(liquidatorAddress, function(err, ethBalance) {
                console.log('ethBalance', web3.fromWei(ethBalance).toFixed(4))
                document.getElementById("eth-amount").innerHTML = web3.fromWei(ethBalance).toFixed(4)

                const daiERC20 = web3.eth.contract(erc20ABI).at('0x6b175474e89094c44da98b954eedeac495271d0f')
    
                daiERC20.balanceOf(liquidatorAddress, function(err, daiBalance) {
                  console.log('dai balance', web3.fromWei(daiBalance).toFixed(4))
                  document.getElementById("dai-amount").innerHTML = web3.fromWei(daiBalance).toFixed(4)
      
                  const usdcERC20 = web3.eth.contract(erc20ABI).at('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
      
                  usdcERC20.balanceOf(liquidatorAddress, function(err, usdcBalance) {
                    console.log('usdc balance', web3.fromWei(usdcBalance, 'mwei').toFixed(4))
                    document.getElementById("usdc-amount").innerHTML = web3.fromWei(usdcBalance, 'mwei').toFixed(4)

                    var xmlhttp = new XMLHttpRequest()
                    var theUrl = "/api/loan/agentinfo/balance/btc"
                    xmlhttp.open("GET", theUrl)
                    xmlhttp.send()
                    xmlhttp.onload = function() {
                      if (xmlhttp.status === 200) {
                        const response = JSON.parse(xmlhttp.responseText)
                        const btcBalance = response.btcBalance
                        console.log('btcBalance', btcBalance)

                        document.getElementById("btc-amount").innerHTML = btcBalance

                        // BTC Start

                        document.getElementById('submit-btc').onclick = function() {
                          var btcWithdrawAddress = document.getElementById("btc-address").value;
                          console.log(btcWithdrawAddress)

                          const currentTime = Math.floor(new Date().getTime() / 1000)
                          const currency = 'BTC'

                          const amount = document.getElementById('btc-withdraw-amount').value
                  
                          const address = web3.toChecksumAddress(res[0])
                          const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + btcWithdrawAddress + ' at ' + currentTime
                          web3.personal.sign(message, address, (err, res) => {
                            var xmlhttp = new XMLHttpRequest()
                            var theUrl = "/api/loan/withdraw"
                            xmlhttp.open("POST", theUrl)
                            xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                            xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "BTC", "amount": amount, "withdrawAddress": btcWithdrawAddress }))
                            xmlhttp.onload = function() {
                              if (xmlhttp.status === 200) {
                                const response = JSON.parse(xmlhttp.responseText)
                                console.log('response', response)
                                document.getElementById('btc-withdraw-hash').innerHTML = response.withdrawHash
                              } else if (xmlhttp.status !== 200) {
                                alert('An error occured')
                              }
                            }
                          })
                        }

                        document.getElementById('btc-use-max').onclick = function() {
                          document.getElementById('btc-withdraw-amount').value = parseFloat(btcBalance) - 0.005
                        }

                        // BTC Stop

                        // ETH Start

                        document.getElementById('submit-eth').onclick = function() {
                          const currentTime = Math.floor(new Date().getTime() / 1000)
                          const currency = 'ETH'

                          const amount = document.getElementById('eth-withdraw-amount').value

                          const address = web3.toChecksumAddress(res[0])
                          const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + address + ' at ' + currentTime
                          web3.personal.sign(message, address, (err, res) => {
                            var xmlhttp = new XMLHttpRequest()
                            var theUrl = "/api/loan/withdraw"
                            xmlhttp.open("POST", theUrl)
                            xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                            xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "ETH", "amount": amount }))
                            xmlhttp.onload = function() {
                              if (xmlhttp.status === 200) {
                                const response = JSON.parse(xmlhttp.responseText)
                                console.log('response', response)
                                document.getElementById('eth-withdraw-hash').innerHTML = response.withdrawHash
                              } else if (xmlhttp.status !== 200) {
                                alert('An error occured')
                              }
                            }
                          })
                        }

                        document.getElementById('eth-use-max').onclick = function() {
                          document.getElementById('eth-withdraw-amount').value = parseFloat(web3.fromWei(ethBalance)) - 0.0005
                        }

                        // ETH Stop

                        // DAI Start

                        document.getElementById('submit-dai').onclick = function() {
                          const currentTime = Math.floor(new Date().getTime() / 1000)
                          const currency = 'DAI'

                          const amount = document.getElementById('dai-withdraw-amount').value

                          const address = web3.toChecksumAddress(res[0])
                          const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + address + ' at ' + currentTime
                          web3.personal.sign(message, address, (err, res) => {
                            var xmlhttp = new XMLHttpRequest()
                            var theUrl = "/api/loan/withdraw"
                            xmlhttp.open("POST", theUrl)
                            xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                            xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "DAI", "amount": amount }))
                            xmlhttp.onload = function() {
                              if (xmlhttp.status === 200) {
                                const response = JSON.parse(xmlhttp.responseText)
                                console.log('response', response)
                                document.getElementById('dai-withdraw-hash').innerHTML = response.withdrawHash
                              } else if (xmlhttp.status !== 200) {
                                alert('An error occured')
                              }
                            }
                          })
                        }

                        document.getElementById('dai-use-max').onclick = function() {
                          document.getElementById('dai-withdraw-amount').value = parseFloat(web3.fromWei(daiBalance))
                        }

                        // DAI End

                        // USDC Start

                        document.getElementById('submit-usdc').onclick = function() {
                          const currentTime = Math.floor(new Date().getTime() / 1000)
                          const currency = 'USDC'

                          const amount = document.getElementById('usdc-withdraw-amount').value

                          const address = web3.toChecksumAddress(res[0])
                          const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + address + ' at ' + currentTime
                          web3.personal.sign(message, address, (err, res) => {
                            var xmlhttp = new XMLHttpRequest()
                            var theUrl = "/api/loan/withdraw"
                            xmlhttp.open("POST", theUrl)
                            xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                            xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "USDC", "amount": amount }))
                            xmlhttp.onload = function() {
                              if (xmlhttp.status === 200) {
                                const response = JSON.parse(xmlhttp.responseText)
                                console.log('response', response)
                                document.getElementById('usdc-withdraw-hash').innerHTML = response.withdrawHash
                              } else if (xmlhttp.status !== 200) {
                                alert('An error occured')
                              }
                            }
                          })
                        }

                        document.getElementById('usdc-use-max').onclick = function() {
                          document.getElementById('usdc-withdraw-amount').value = parseFloat(web3.fromWei(usdcBalance))
                        }

                        // USDC End
                      }
                      else if (xmlhttp.status !== 200) {
                        alert('An error occured')
                      }
                    }
                  })
                })
              })
            })
          }
          else if (xmlhttp.status !== 200) {
            alert('An error occured')
          }
        }
      })
    `

    // const timestamp = Math.floor(new Date().getTime() / 1000)
    // const amount = 1
    // const currency = 'ETH'
    // const address = await getWeb3Address(chain)
    // const message = `Withdraw ${amount} ${currency} to ${address} at ${timestamp}`

    // await chains.ethereumWithNode.client.chain.sendTransaction(address, toWei(amount.toString(), 'ether'))

    // const signature = await chain.client.eth.personal.sign(message, address)
    // const balanceBefore = await chains.ethereumWithNode.client.chain.getBalance(address)

    // await chai.request(server).post('/withdraw').send({ currency, timestamp, signature, amount, message })

    // const balanceAfter = await chains.ethereumWithNode.client.chain.getBalance(address)

    // expect(BN(balanceAfter).toFixed()).to.equal(BN(balanceBefore).plus(BN(toWei(amount.toString(), 'ether'))).toFixed())

    return (
      <>
        <head>
          <link rel='stylesheet' href='/public/css/main.css' />
        </head>
        <body>
          <div className='text-center thin homedashboard'>
            <h1>Dashboard</h1>

            <table className="MuiTable-root">
              <thead className="MuiTableHead-root">
                <p id="liquidator-address" style={{ textAlign: 'left' }}>0x</p>
                <tr className="MuiTableRow-root jss162 MuiTableRow-head jss163">
                  <th className="MuiTableCell-root MuiTableCell-head jss169" scope="col">Asset</th>
                  <th className="MuiTableCell-root MuiTableCell-head jss169 MuiTableCell-alignCenter" scope="col">Balance</th>
                </tr>
              </thead>
              <tbody className="MuiTableBody-root">
                <tr className="MuiTableRow-root jss162">
                  <th className="MuiTableCell-root MuiTableCell-body jss170" scope="row">USDC</th>
                  <td className="MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter" id="usdc-amount">0.00</td>
                </tr>
                <tr className="MuiTableRow-root jss162">
                  <th className="MuiTableCell-root MuiTableCell-body jss170" scope="row">DAI</th>
                  <td className="MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter" id="dai-amount">0.00</td>
                </tr>
                <tr className="MuiTableRow-root jss162">
                  <th className="MuiTableCell-root MuiTableCell-body jss170" scope="row">ETH</th>
                  <td className="MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter" id="eth-amount">0.00</td>
                </tr>
              </tbody>
            </table>

            <div className='field'>
              <input placeholder='100' label='USDC Amount' value='' id='usdc-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-usdc'>Submit</div>
            </div>
            <button id='usdc-use-max'>Use Max</button>
            <p id='usdc-withdraw-hash'></p>

            <div className='field'>
              <input placeholder='100' label='DAI Amount' value='' id='dai-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-dai'>Submit</div>
            </div>
            <button id='dai-use-max'>Use Max</button>
            <p id='dai-withdraw-hash'></p>

            <div className='field'>
              <input placeholder='2.3' label='2.3' value='' id='eth-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-eth'>Submit</div>
            </div>
            <button id='eth-use-max'>Use Max</button>
            <p id='eth-withdraw-hash'></p>

            <table className="MuiTable-root">
              <thead className="MuiTableHead-root">
                <p id="liquidator-btc-receive-address" style={{ textAlign: 'left' }}></p>
                <tr className="MuiTableRow-root jss162 MuiTableRow-head jss163">
                  <th className="MuiTableCell-root MuiTableCell-head jss169" scope="col">Asset</th>
                  <th className="MuiTableCell-root MuiTableCell-head jss169 MuiTableCell-alignCenter" scope="col">Balance</th>
                </tr>
              </thead>
              <tbody className="MuiTableBody-root">
                <tr className="MuiTableRow-root jss162">
                  <th className="MuiTableCell-root MuiTableCell-body jss170" scope="row">BTC</th>
                  <td className="MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter" id="btc-amount">0.00</td>
                </tr>
              </tbody>
            </table>

            <br />
            <br/>

            <div className='field'>
              <input placeholder='bc1qr7tgxt4lexl0ys5q27euz0qatsp09wzva7aycm' label='BTC Address' value='' id='btc-address' />
              <input placeholder='0.88' label='0.88' value='' id='btc-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-btc'>Submit</div>
            </div>
            <button id='btc-use-max'>Use Max</button>
            <p id='btc-withdraw-hash'></p>

            <br />
            <br />

            <a href='/key' className='MuiButtonBase-root MuiButton-root borrow-selected app-btn MuiButton-text' id='finish-btn' tabindex='0' type='button' style={{ cursor: 'pointer', display: 'none' }}>
              <span className='MuiButton-label'>Finish Setup</span>
              <span className='MuiTouchRipple-root' />
            </a>

          </div>

          <script dangerouslySetInnerHTML={{ __html: initScript }} />
        </body>
      </>
    )
  }
}

module.exports = App
