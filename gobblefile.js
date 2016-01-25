var gobble = require( 'gobble' );
var babel = require('rollup-plugin-babel');
var npm = require('rollup-plugin-npm');
var commonjs = require('rollup-plugin-commonjs');


var rollupSettings = {
  format: 'es6',
  sourceMap: true,
  plugins: [
    npm({
      jsnext: true,
      main: true,
      skip: []
    }),
    commonjs(),
    babel({
      babelrc: false,
      compact: false,
      "presets": [ "es2015-rollup"],
      "plugins": [
        "syntax-async-functions",
        "transform-async-to-generator"
      ]
    })
  ]
}

module.exports = gobble([
    gobble('src/root'),
    gobble( 'src/styles' ).transform('sass', {
        'src': 'main.scss',
        'dest': 'main.css'
    }),
    gobble('src/js')
      .transform('rollup', Object.assign({}, rollupSettings,
                                         {
                                           entry: 'app.es6',
                                           dest: 'app.js'
                                         })
      ),//.transform('uglifyjs'),
      gobble('src/js')
        .transform('rollup', Object.assign({}, rollupSettings,
                                           {
                                             entry: 'worker.es6',
                                             dest: 'worker.js'
                                           })
        )//.transform('uglifyjs')
    ]);
