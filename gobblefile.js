var gobble = require( 'gobble' );
var rollupBabel = require('rollup-plugin-babel');
var npm = require('rollup-plugin-npm');
var commonjs = require('rollup-plugin-commonjs');


function rollupSettings() {
  return{
    format: 'es6',
    sourceMap: true,
    plugins: [
      npm({
        jsnext: true,
        main: true,
        skip: []
      }),
      commonjs(),
      rollupBabel({
        babelrc: false,
        compact: false,
        "presets": [ "es2015-rollup"],
        "plugins": [
          "syntax-function-bind",
          "syntax-async-functions",
          "transform-async-to-generator",
          "transform-function-bind"
        ]
      })
    ]
  }
}

module.exports = gobble([
    gobble('src/root'),
    gobble( 'src/styles').transform('sass', {
      'src': 'lookup.scss',
      'dest': 'lookup.css'
    }),
    gobble('src/js')
      .transform('rollup', Object.assign(rollupSettings(),
                                         {
                                           entry: 'lookup.es6',
                                           dest: 'lookup-1.2.js'
                                         })
      ),//.transform('uglifyjs'),
      gobble('src/js')
        .transform('rollup', Object.assign(rollupSettings(),
                                           {
                                             entry: 'lookup-worker-backend.es6',
                                             dest: 'lookup-worker-1.2.js'
                                           })
        )//.transform('uglifyjs')
    ]);
