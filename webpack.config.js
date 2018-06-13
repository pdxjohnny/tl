const path = require('path');

module.exports = {
  mode: 'production',
  entry: './tinylib.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'tinylib.js',
    library: 'tinylib',
    libraryTarget: 'umd'
  },
  externals: {
    muicss: {
      commonjs: 'muicss',
      commonjs2: 'muicss',
      amd: 'muicss',
      root: 'muicss'
    }
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [ 'style-loader', 'css-loader' ]
      }
    ]
  }
};
