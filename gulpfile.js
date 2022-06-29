// 实现这个项目的构建任务
// 项目构建的步骤思路：
// 01 compile编译scss和js文件，包括相应的浏览器适配，和文件的压缩优化
// - lint styles & lint javascript
// postCss with prefix

// 02 最后处理模版文件的渲染 并替换里面的引用文件
const { task, src, dest, parallel, series, watch, lastRun } = require('gulp')
const del = require('delete')
const browserSync = require('browser-sync')
const autoprefixer = require('autoprefixer')
const gulpLoadPlugins = require('gulp-load-plugins')
const cssnano = require('cssnano')
const standard = require('standard')
const stylelint = require('stylelint')
const path = require('path')

// 记录自动载入已安装的插件
const $ = gulpLoadPlugins()
// 创建一个BrowserSync实例
const bs = browserSync.create()
// 解析运行命令行时传入的参数
const argv = require('minimist')(process.argv.slice(2))
// 判断当前打包模式是否为生产模式
const isProd = process.env.NODE_ENV
    ? process.env.NODE_ENV === 'production'
    : argv.production || argv.prod || false

// 当前打包项目的一些文件目录及相关路径的管理配置
const config = {
    src: 'src',
    dest: 'dist',
    temp: 'temp',
    public: 'public',
    paths: {
        pages: '**/*.html',
        styles: 'assets/styles/**/*.{scss,css}',
        scripts: 'assets/scripts/**/*.js',
        images: 'assets/images/**/*.{jpg,jpeg,png,gif,svg}',
        fonts: 'assets/fonts/**/*.{eot,svg,ttf,woff,woff2}'
    }
}
// swig模版编译的配置options
const swigOpts = {
    defaults: {
        cache: false, // Avoid caching when watching/compiling html templates with BrowserSync, etc.
    },
    // load_json: true, // load json file for template file
    // json_path: './jsonpatch/',
    data: {
        pkg: require('./package.json'),
        date: new Date(),
        menus: [
            {
                "name": " Home (current)",
                "link": "https://denghuiquan.github.io/index.html",
                "icon": 'aperture'
            },
            {
                "name": "Features",
                "link": "https://denghuiquan.github.io/features.html"
            },
            {
                "name": "About",
                "link": "https://denghuiquan.github.io/about.html"
            },
            {
                "name": "Contact",
                "link": "https://denghuiquan.github.io/#",
                "children": [
                    {
                        "name": "Twitter",
                        "link": "https://twitter.com/w_zce"
                    },
                    {
                        "name": "About",
                        "link": "https://weibo.com/zceme"
                    },
                    {
                        "name": "divider"
                    },
                    {
                        "name": "About",
                        "link": "https://github.com/denghuiquan"
                    }
                ]
            }
        ]
    }
}

// "clean": "gulp clean",
function clean(cb) {
    // 直接使用 `delete` 模块，避免使用 gulp-rimraf 插件
    del([config.dest, config.temp], cb)
}

// compile styles
function styles() {
    return src(config.paths.styles, { cwd: config.src, base: config.src, sourcemaps: !isProd })
        .pipe($.plumber())
        .pipe($.sass(require('sass')).sync({ outputStyle: 'expanded', precision: 10, includePaths: ['.'] }))
        .pipe($.postcss([autoprefixer()]))
        // .pipe($.rev())
        .pipe(dest(config.temp, { sourcemaps: '.' }))
        .pipe(bs.reload({ stream: true }))
}

// compile scripts
function scripts() {
    return src(config.paths.scripts, { cwd: config.src, base: config.src, sourcemaps: !isProd })
        .pipe($.plumber())
        .pipe($.babel())
        // 开发时不需要给文件添加版本号，构建生产资源的时候再统一处理
        // .pipe($.rev())
        .pipe(dest(config.temp, { sourcemaps: '.' }))
        .pipe(bs.reload({ stream: true }))
}

// pages
function pages() {
    return src(config.paths.pages, { cwd: config.src, base: config.src, ignore: ['{layouts,partials}/**'] })
        .pipe($.plumber()) // 防止因gulp插件的错误而导致管道中断，plumber可以阻止 gulp 插件发生错误导致进程退出并输出错误日志
        // 开发阶段也不需要抽离文件引用进行分包压缩等优化，页面及相关资源正常加载运行即可
        // .pipe($.useref({ searchPath: ['.', '..'] }))
        // 生产build是才需要
        // .pipe($.if('*.js', $.uglify()))
        // .pipe($.if('*.css', $.cleanCss()))
        .pipe($.swig(swigOpts))
        .pipe(dest(config.temp))
        .pipe(bs.reload({ stream: true }))
}

// build pages with minimization to dist dir
function buildPages() {
    // https://beautifier.io
    const beautifyOpts = { indent_size: 2, max_preserve_newlines: 1 }
    // https://github.com/mishoo/UglifyJS2#minify-options
    const uglifyOpts = { compress: { drop_console: true } }
    // https://cssnano.co/guides/
    const postcssOpts = [cssnano({
        preset: ['default', {
            safe: true,
            discardComments: {
                removeAll: true,
            },
            autoprefixer: true
        }]
    })]

    // https://github.com/kangax/html-minifier#options-quick-reference
    const htmlminOpts = {
        collapseWhitespace: true,
        minifyCSS: true,
        minifyJS: true,
        processConditionalComments: true,
        removeComments: true,
        removeEmptyAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true
    }
    return src(config.paths.pages, { cwd: config.temp, base: config.temp })
        .pipe($.plumber())
        .pipe($.useref({ searchPath: ['.', '..'] }))
        .pipe($.if(/\.js$/, $.if($.uglify(uglifyOpts), $.beautify.js(beautifyOpts))))
        .pipe($.if(/\.css$/, $.if($.postcss(postcssOpts/* [autoprefixer()] */), $.cleanCss(), $.beautify.css(beautifyOpts))))
        .pipe($.if(/\.html$/, $.if($.htmlmin(htmlminOpts), $.beautify.html(beautifyOpts))))
        .pipe(dest(config.dest))
}

// 处理图片文件和字体文件
function imageNfont() {
    return src([config.paths.images, config.paths.fonts], { cwd: config.src, base: config.src, since: lastRun(imageNfont) })
        .pipe($.plumber())
        .pipe($.if(isProd, $.imagemin()))
        .pipe(dest(config.dest))
}
// 
function font() {
    return src(config.paths.fonts, { cwd: config.src, base: config.src, since: lastRun(font) })
        .pipe($.plumber())
        .pipe($.if(isProd, $.imagemin()))
        .pipe(dest(config.dest))
}
// 处理额外的的静态资源文件
function extra() {
    return src('**', { cwd: config.public, base: config.public, dot: true })
        .pipe(dest(config.dest))
}

// use gulp-size to display the size of your project
function measure() {
    return src('**', { cwd: config.dest })
        .pipe($.plumber())
        .pipe($.size({ title: `${isProd ? 'Prodcuction' : 'Development'} mode build`, gzip: true, showFiles: true }))
}

// "lint": "gulp lint",
function lintJs(cb) {
    const isFixed = argv.fix || false
    const cwd = path.join(__dirname, config.src)
    try {
        // 这里默认会读取package.json中配置的standard的相关配置选项
        standard.lintFiles(config.paths.scripts, { cwd, fix: isFixed }, cb)
    } catch (err) {
        cb(err)
    }
}
function lintCss(cb) {
    const isFixed = argv.fix || false
    const cwd = path.join(__dirname, config.src)
    // 这里默认会读取package.json中配置的stylelint的相关配置选项
    stylelint.lint({ files: config.paths.styles, fix: isFixed, formatter: 'verbose', globbyOptions: { cwd } })
        .then((resultObject) => {
            if (resultObject.errored) {
                return cb(resultObject.output)
            }
            cb()
        })
        .catch((err) => {
            cb(err)
        })
}

// devServer
function devServer() {
    // 设置watch后自动启动对应task，并同步更新到浏览器
    watch(config.paths.styles, { cwd: config.src }, styles)
    watch(config.paths.scripts, { cwd: config.src }, scripts)
    watch(config.paths.pages, { cwd: config.src }, pages)

    browserSync.init({
        notify: false,
        port: argv.port || 3030,
        open: argv.open || false,
        plugins: [`bs-html-injector?files[]=${config.temp}/*.html`],
        server: {
            baseDir: [config.temp, config.src, config.public],
            routes: { '/node_modules': 'node_modules' }
        }
    })
    // 这里使用了bs-html-injector进行同步了
    // watch(config.paths, { cwd: config.src }, browserSync.reload)
}

// browser sync serve for the dist dir
const distServer = () => {
    bs.init({
        notify: false,
        port: argv.port || 2080,
        open: argv.open || false,
        server: config.dest
    })
}

// 生成版本号引用文件及清单
// Step 1 生成版本号引用文件
function revision() {
    return src([config.paths.scripts, config.paths.styles], { cwd: config.dest, base: config.dest })
        .pipe($.rev()) // 给文件添加版本号
        .pipe(dest(config.dest))
        // .pipe($.rev.manifest()) // 生成版本号文件的清单manifest.json
        .pipe(src(`${config.dest}/**/*.html`))
        .pipe($.revRewrite()) //修改html文件引用为带版本号路径, 这里采用不生成清单的方式直接回写
        // .pipe(dest(`${config.dest}/assets`))
        .pipe(dest(config.dest))
}

// Step 2 版本号引用文件回写到html中
// function rewrite() {
//     return src(`${config.dest}/**/*.html`)
//         .pipe($.revRewrite({ manifest: require('fs').readFileSync(`${config.dest}/assets/rev-manifest.json`) }))
//         .pipe(dest(config.dest))
// }


// "deploy": "gulp deploy --production"
function deployghPages() {
    return src(`${config.dest}/**/*`)
        .pipe($.plumber())
        .pipe($.ghPages({
            remoteUrl: 'git@github.com:denghuiquan/denghuiquan.github.io.git',
            cacheDir: `${config.temp}/publish`,
            branch: argv.branch || 'gh-pages'
        }))
}

const lint = parallel(lintJs, lintCss)
const compile = parallel(styles, scripts, pages)
const serve = series(clean, compile, devServer)
// 先清理，
// 再编译构建到temp目录下，
// 然后以temp目录下的html文件为入口，对html中的引用文件按预设抽离分包并分类进行相应优化处理后保存到dist目录中。
// 再对dist目录中的styles和scripts资源文件赋予文件版本号，最后重写新的文件引用回html
// 拷贝其他html及css和js的公共资源如图片，字体等资源到dist目录，并进行相应的压缩优化
const build = series(
    clean,
    parallel(
        series(compile, buildPages, revision/* series(revision, rewrite) */),
        imageNfont,
        extra
    ),
    measure
)
const start = series(build, distServer)
const deploy = series(build, deployghPages)

module.exports = {
    clean,
    build,
    serve,
    lint,
    start,
    deploy,
    compile: series(clean, compile)
}

// 默认使用start启动一个项目
module.exports.default = series(clean, compile)
