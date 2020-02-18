const React = require('react')

class App extends React.Component {
  render () {
    return (
      <>
        <head>
          <link rel='stylesheet' href='/public/css/main.css' />
        </head>
        <body>
          <div className='text-center thin homedashboard'>
            <h1>
              Setup <span className='theme'>Complete</span>
            </h1>
            <p>You can now go back to the Atomic Loans tab</p>
          </div>
        </body>
      </>
    )
  }
}

module.exports = App
