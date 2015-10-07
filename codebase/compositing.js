/**************************************************************************

	Overlay/Compositing

	Dependencies: jQuery, Tween, helios-frame-runner

	DOM requirements: one <canvas> element


	Effect Types:
		Particle
		Gradient

**************************************************************************/




(function(window, angular, undefined) {'use strict';

angular.module('heliosCanvasCompositor', ['ng'])
.factory('canvasCompositor',[
	'$window', '$timeout', '$rootScope', 'frameRunner', 'audioControl', 'detect',
function(
	$window, $timeout, $rootScope, frameRunner, audioControl, detect
) {




// WebGL
// ********************************************************

/**
 * Creates a program, attaches shaders, binds attrib locations, links the
 * program and calls useProgram.
 * @param {!Array.<!WebGLShader>} shaders The shaders to attach
 * @param {!Array.<string>} opt_attribs The attribs names.
 * @param {!Array.<number>} opt_locations The locations for the attribs.
 */
var loadProgram = function(gl, shaders, opt_attribs, opt_locations) {
  var program = gl.createProgram();
  for (var ii = 0; ii < shaders.length; ++ii) { gl.attachShader(program, shaders[ii]); }
  if (opt_attribs) {
	for (var iii = 0; iii < opt_attribs.length; ++iii) {
	  gl.bindAttribLocation( program, (opt_locations ? opt_locations[iii] : iii), opt_attribs[iii]);
	}
  }

  gl.linkProgram(program);

  // Check the link status
  var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!linked) {
	  // something went wrong with the link
	  var lastError = gl.getProgramInfoLog (program);
	  console.error('Error in program linking:' + lastError);

	  gl.deleteProgram(program);
	  return null;
  }
  return program;
};

/**
 * Loads a shader from a script tag.
 * @param {!WebGLContext} gl The WebGLContext to use.
 * @param {string} scriptId The id of the script tag.
 * @param {number} opt_shaderType The type of shader. If not passed in it will
 *     be derived from the type of the script tag.
 * @param {function(string): void) opt_errorCallback callback for errors.
 * @return {!WebGLShader} The created shader.
 */
var createShaderFromScript = function(
	gl, scriptId, opt_shaderType, opt_errorCallback) {
  var shaderSource = '';
  var shaderType;
  var shaderScript = document.getElementById(scriptId);
  if (!shaderScript) {
	throw('*** Error: unknown script element' + scriptId);
  }
  shaderSource = shaderScript.text;

  if (!opt_shaderType) {
	if (shaderScript.type == 'x-shader/x-vertex') {
	  shaderType = gl.VERTEX_SHADER;
	} else if (shaderScript.type == 'x-shader/x-fragment') {
	  shaderType = gl.FRAGMENT_SHADER;
	} else if (shaderType != gl.VERTEX_SHADER && shaderType != gl.FRAGMENT_SHADER) {
	  throw('*** Error: unknown shader type');
	  return null;
	}
  }
  return loadShader(
	  gl, shaderSource, opt_shaderType ? opt_shaderType : shaderType,
	  opt_errorCallback);
};

/**
 * Loads a shader.
 * @param {!WebGLContext} gl The WebGLContext to use.
 * @param {string} shaderSource The shader source.
 * @param {number} shaderType The type of shader.
 * @param {function(string): void) opt_errorCallback callback for errors.
 * @return {!WebGLShader} The created shader.
 */
var loadShader = function(gl, shaderSource, shaderType, opt_errorCallback) {
  var shader = gl.createShader(shaderType); // Create the shader object
  gl.shaderSource(shader, shaderSource); // Load the shader source
  gl.compileShader(shader); // Compile the shader

  // Check the compile status
  var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!compiled) {
	// Something went wrong during compilation; get the error
	var lastError = gl.getShaderInfoLog(shader);
	console.error('*** Error compiling shader "' + shader + '":' + lastError);
	gl.deleteShader(shader);
	return null;
  }

  return shader;
}

var create3DContext = function(canvas, opt_attribs) {
  var names = ['webgl', 'experimental-webgl'];
  var context = null;
  for (var ii = 0; ii < names.length; ++ii) {
	try {
	  context = canvas.getContext(names[ii], opt_attribs);
	} catch(e) {}
	if (context) {
	  break;
	}
  }
  return context;
}

var setRectangle = function(gl, x, y, width, height) {
	var x1 = x, x2 = x + width, y1 = y, y2 = y + height;
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]), gl.STATIC_DRAW);
}











	// Utilities
	// ~~~~~~~~~

	var rand = function(min, max){
		return Math.random() * (max - min) + min;
	}

	var extend = function(){
		var output = {},
			args = arguments,
			l = args.length;

		for ( var i = 0; i < l; i++ )
			for ( var key in args[i] )
				if ( args[i].hasOwnProperty(key) )
					output[key] = args[i][key];
		return output;
	};


	var resize = function(event, data){

		// accounting for NFB menu
		if( target.canvas ){
			target.canvas.style.width  =   data.cover.w        + 'px';
			target.canvas.style.height = ( data.cover.h - 60 ) + 'px';
			target.canvas.style.top    = ( data.cover.t + 30 ) + 'px';
			target.canvas.style.left   =   data.cover.l        + 'px';
		}

		if( transition_video){
			transition_video.style.width  =   data.cover.w + 'px';
			transition_video.style.height =   data.cover.h + 'px';
			transition_video.style.top    =   data.cover.t + 'px';
			transition_video.style.left   =   data.cover.l + 'px';
		}

		// fallback: using
		if( detect.mobile ){
			video.activeEl.style.width  =   data.cover.w  + 'px';
			video.activeEl.style.height = ( data.cover.h) + 'px';
			video.activeEl.style.top    = ( data.cover.t) + 'px';
			video.activeEl.style.left   =   data.cover.l  + 'px';
		}

	}

	var effects       = [],
		effect_lookup = {},
		events        = {},
		options       = {};

	var target = {
		$el:    null,
		canvas: null,
		ctx:    null,
		w:      0,
		h:      0
	};

	var transition_video = document.querySelector('#transition-video')

	var buffer, bufferCtx;

	if( ! $rootScope.cc )
		$rootScope.cc = {
			mode:  null,
			track: null,
			playing: false
		}

	var video = {
		A: null,
		B: null,

		alphaChannel : { A: null, B: null },
		alphaChannelReady: false,

		// ready:   false,
		options: {},
		alpha:   1,

		activeEl:   null,
		inactiveEl: null,
		active:     'A'
	}

	var audio;

	var globalCompositeMode = 'source-over', // source-over is default, set to 'destination-out' for effects
		clearCanvas = false;

	// Status
	var transitioning = false, // defer actions until after transitions are complete
		transitioning_callbacks = [], // deferred actions
		frameRunning = false,
		ready = false;

	// WebGL
	var glCanvas,
		gl,
		vertexShader,
		fragmentShader,
		program,
		texture;

	var oldOutTween,
			newInTween,
			entryTween

	var startedPlay = 0,
		timeAtPlay = 0;























	//  ██████╗ ██████╗ ███╗   ██╗███████╗████████╗██████╗ ██╗   ██╗ ██████╗████████╗ ██████╗ ██████╗
	// ██╔════╝██╔═══██╗████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██║   ██║██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗
	// ██║     ██║   ██║██╔██╗ ██║███████╗   ██║   ██████╔╝██║   ██║██║        ██║   ██║   ██║██████╔╝
	// ██║     ██║   ██║██║╚██╗██║╚════██║   ██║   ██╔══██╗██║   ██║██║        ██║   ██║   ██║██╔══██╗
	// ╚██████╗╚██████╔╝██║ ╚████║███████║   ██║   ██║  ██║╚██████╔╝╚██████╗   ██║   ╚██████╔╝██║  ██║
	//  ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝


	var init = function(opts){

		var defaults = {
			canvasId: null,
			videoId: null,
			videoIdB: null,
			width: 0,
			height: 0,
			mobile: false
		}
		options = extend.call(this, defaults, opts || {});

		detect.mobile = options.mobile;


		// ********************************************************
		// mobile fallback mode

		if( detect.mobile ){

			video.activeEl = document.getElementById('fallback-video');

			video.activeEl.addEventListener('ended', function(){
				$rootScope.$emit('cc.ended')
			}, false )

			video.activeEl.addEventListener('canplaythrough', function(){

				// if(ready === true) return;
				ready = true;

				$timeout(function(){
					$rootScope.videoPlayerReady = true;
					$rootScope.$emit('cc.canplaythrough');
				})

				if( !$rootScope.muted ) video.activeEl.volume = 1
				playVideo();

			}, false )

			// var seeked = function(){
			// 	$timeout(function(){ $rootScope.videoPlayerReady = true })
			// 	video.activeEl.removeEventListener('timeupdate', seeked)
			// }

			// video.activeEl.addEventListener('seeked',function(){
			// 	video.activeEl.addEventListener('timeupdate', seeked, false)
			// })

			return;
		}

		// ********************************************************


		// Set up target canvas
		if(options.canvasId) {
			target.$el           = $('#'+options.canvasId);
			target.canvas        = target.$el[0];

			target.canvas.width  = target.w = options.width;
			target.canvas.height = target.h = options.height;

			target.ctx = target.canvas.getContext('2d');
		} else {
			console.warn('[Compositor] Can’t init, no target canvas');
		}

		if( detect.mobile && !options.videoId ){
			console.warn('[Compositor] No mobile() support, need <video> in DOM')
		}

		$rootScope.$watch('video.resolution', function(n){
			if(!n) return;
			options.videoSuffix = '-' + n;

			// if the compositor is playing a video, try to switch resolution on the fly
			if( $rootScope.compositorVisible )
				switchVideoResolution()
		})

		console.log('[compositor] mobile : ' + detect.mobile + ', WebGL: '+ detect.WebGL + ', videoType: "' + detect.videoType + '"', options);


		// Video
		// ~~~~~

		if(options.videoId) video.A = document.getElementById(options.videoId);
		else                video.A = document.createElement('video');

		if(options.videoIdB) video.B = document.getElementById(options.videoIdB);
		else                 video.B = document.createElement('video');

		video.alphaChannel.A = document.createElement('video');
		video.alphaChannel.B = document.createElement('video');

		video.A.className += ' video-A';
		video.B.className += ' video-B';

		if( bowser.firefox ){
			// for firefox
			video.A.setAttribute('type', 'video/webm')
			video.B.setAttribute('type', 'video/webm')
		}

		video.activeEl   = video.A;
		video.inactiveEl = video.B;

		video.activeEl.opacity   = 1;
		video.activeEl.volume    = 1;
		video.inactiveEl.opacity = 0;
		video.inactiveEl.volume  = 0;


		// Events
		// ~~~~~~

		var canplaythrough = function(){

			$timeout(function(){
				$rootScope.$emit('cc.canplaythrough')
				$rootScope.videoPlayerReady = true;
			})

			if(ready === true) return;
			ready = true;


			setTimeout(function(){
				newInTween.start();
				if( typeof video.options.crossfade === 'number'){
					video.crossfading = true;
					oldOutTween.start();
				}
			}, 100)

			playVideo();
			setCompositeMode();

			if( video.options.alphaChannel && detect.WebGL ){
				webGLSetup();
			}

		}

		var seeked = function(){
			$timeout(function(){ $rootScope.videoPlayerReady = true })
		}

		var ended   = function(){ $rootScope.$emit('cc.ended') }
		var waiting = function(){ $rootScope.$emit('cc.waiting') }

		video.A.addEventListener('canplaythrough', canplaythrough, false);
		video.B.addEventListener('canplaythrough', canplaythrough, false);

		video.A.addEventListener('ended', ended, false);
		video.B.addEventListener('ended', ended, false);

		video.A.addEventListener('waiting', waiting, false);
		video.B.addEventListener('waiting', waiting, false);

		video.A.addEventListener('seeked', seeked, false);
		video.B.addEventListener('seeked', seeked, false);


		// Buffer
		// ~~~~~~

		buffer = document.createElement('canvas');
		bufferCtx = buffer.getContext('2d');

		buffer.width  = options.width;
		buffer.height = options.height * 2;

	}



	function getVideoSrc( name ){
		return options.videoPrefix + name + options.videoSuffix + detect.videoType;
	}




	// Events
	// ~~~~~~

	// with namespacing support: event.namespace

	var on = function( type, callback ){

		var namespace = false,
			t = type.split('.');

		type = t[0];
		if( t[1] ) namespace = t[1];

		events[type] = events[type] || [];

		events[type].push( {
			namespace: namespace,
			f: callback
		});
	};

	var off = function( type ){

		var namespace = false,
			t = type.split('.');

		type = t[0];
		if( t[1] ) namespace = t[1];

		if( namespace ){

			var eventType;

			for ( eventType in events ) {
				if (! events.hasOwnProperty(eventType)) continue;

				if( type !== '*' && eventType !== type ) continue;

				var i = events[eventType].length;

				while (i--) {
					if( events[eventType][i].namespace === namespace)
						events[eventType].splice(i,1);
				}
			}

		} else {
			events[type] = [];
		}

	};

	var trigger = function( type ){

		if ( ! events[type] ) return;
		var args = Array.prototype.slice.call( arguments, 1 );

		for (var i = 0, l = events[type].length; i < l;  i++)
			if ( typeof events[type][i].f == 'function' )
				events[type][i].f.apply(this, args);
	};






	// Transition (action deferral system)
	// ~~~~~~~~~~

	var defer = function( funk ){
		transitioning_callbacks.push( funk );
	}

	var startTransition = function(){
		transitioning = true;
	}

	var endTransition = function(){

		setTimeout(function() {

			transitioning = false;
			if( transitioning_callbacks ){
				for (var i = 0; i < transitioning_callbacks.length; i++) {
					if( typeof transitioning_callbacks[i] === 'function' )
						transitioning_callbacks[i]();
				}
			}

			transitioning_callbacks = [];

		}, 100);

	}






	// Master Controls
	// ~~~~~~~~~~~~~~~

	var start = function(){

		if( frameRunning || !frameRunner ) return;

		if(transitioning) { defer( start ); return; }

		if( ! $rootScope.cc.playing && $rootScope.cc.mode === 'video' ) playVideo();

		$rootScope.$emit('cc.start');

		$timeout(function(){
			$rootScope.compositorVisible = true;
		})

		if( detect.mobile ) return;

		frameRunning = true;
		frameRunner.add('helios-canvas-compositor', 'everyFrame', update);

	}


	var destroy = function( fadeTime ){

		if(transitioning) { defer( destroy ); return; }

		$timeout(function(){
			$rootScope.videoPlayer = false;
			$rootScope.compositorVisible = false;
			$rootScope.subtitles.active  = false;
			$rootScope.videoPlayerReady  = false;
		});

		var doIt = function(){

			if( $rootScope.cc.mode === 'audio' && audio ){
				audioControl.remove( audio.name );
			}

			$timeout(function(){
				$rootScope.cc.mode = ''
				$rootScope.cc.playing = false;

				$rootScope.$emit('cc.ended');
				$rootScope.$emit('cc.destroy');
			})

			video.activeEl.opacity = 0;
			video.activeEl.volume  = 0;

			if(frameRunner){
				frameRunning = false;
				frameRunner.remove('helios-canvas-compositor', 'everyFrame');
			}

			stopVideo( true );

			if( $rootScope.mobile ){

				video.activeEl.src = "";

			} else {

				target.ctx.clearRect(0,0, target.canvas.width, target.canvas.height);

			}

			endTransition();

		}

		if( typeof fadeTime === 'number' ) {
			startTransition();

			// fade active vid alpha & volume from current -> 0

			var alphaTween = new TWEEN.Tween({ alpha: ((video.activeEl.opacity) ? video.activeEl.opacity : 1) })
				.to( { alpha: 0 }, fadeTime )
				.easing( TWEEN.Easing.Sinusoidal.InOut )
				.onUpdate(function(){

					video.activeEl.opacity = this.alpha
					video.activeEl.volume = this.alpha

					if( $rootScope.cc.mode === 'audio' && audio )
						audio.gain( this.alpha );

				})
				.onComplete( doIt )
				.start();

		} else {
			doIt();
		}

	}



	var reset = function( fadeTime, callback ){

		trigger('reset');

		if( detect.mobile ) {
			video.activeEl.src      = '';
			video.alphaChannel      = false;
			video.alphaChannelReady = false;
			ready             = false;

			if( callback )
				if( typeof callback === 'function')
					callback();

			return;
		}

		if(transitioning) { defer( function(){ reset(fadeTime,callback) } ); return; }

		if( typeof fadeTime === 'number' ) {

			new TWEEN.Tween({ fade: video.activeEl.opacity })
				.to( { fade: 0 }, fadeTime )
				.easing(TWEEN.Easing.Sinusoidal.InOut)
				.onUpdate(function(){

					video.activeEl.style.opacity = this.fade;
					video.activeEl.opacity = this.fade;

					if( ! $rootScope.muted )
						video.activeEl.volume  = this.fade;
				})
				.onComplete(function(){
					removeAllEffects(0, callback);
					stopVideo( true );
					video.activeEl.src = '';
				})
				.start()

		} else {
			removeAllEffects(0, callback);
			stopVideo( true );

			audio = false;
			video.activeEl.src      = '';
			video.inactiveEl.src    = '';
			video.alphaChannel      = false;
			video.alphaChannelReady = false;
			ready             = false;
		}
	}












	// WebGL
	// ~~~~~

	var webGLSetup = function(){

		if( ! video.options.alphaChannel ) return;

		glCanvas = document.createElement('canvas');

		glCanvas.width  = options.width;
		glCanvas.height = options.height;

		gl = create3DContext(glCanvas);

		// setup GLSL program
		vertexShader = createShaderFromScript(gl, '2d-vertex-shader' );
		fragmentShader = createShaderFromScript(gl, '2d-fragment-shader-'  + video.options.alphaChannel );
		program = loadProgram(gl, [vertexShader, fragmentShader]);
		gl.useProgram(program);

		// look up where the vertex data needs to go.
		var positionLocation = gl.getAttribLocation(program, 'a_position');
		var texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

		// provide texture coordinates for the rectangle.
		var texCoordBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			0.0,  0.0,
			1.0,  0.0,
			0.0,  1.0,
			0.0,  1.0,
			1.0,  0.0,
			1.0,  1.0]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(texCoordLocation);
		gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

		// Create a texture.
		texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Set the parameters so we can render any size image.
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

		// Upload the image into the texture.
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video.activeEl);

		// lookup uniforms
		var resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

		// set the resolution
		gl.uniform2f(resolutionLocation, glCanvas.width, glCanvas.height/2);

		// Create a buffer for the position of the rectangle corners.
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

		setRectangle(gl, 0, -glCanvas.height/4, glCanvas.width, glCanvas.height);

	}











	// ##  ## #### ######  ######  ######
	// ##  ##  ##  ##   ## ##     ##    ##
	// ##  ##  ##  ##   ## #####  ##    ##
	//  ####   ##  ##   ## ##     ##    ##
	//   ##   #### ######  ######  ######

	var preloadVideo = function( vid ){

		video.inactiveEl.autoplay = false
		video.inactiveEl.src = options.videoPrefix + vid + options.videoSuffix + detect.videoType;
		video.inactiveEl.load();
		video.inactiveEl.volume  = 0;
		video.inactiveEl.opacity = 0;
	}

	var loadVideo = function(opts){

		if(transitioning) {
			defer( function(){ loadVideo(opts) } );
			return;
		}

		$timeout(function(){
			$rootScope.$emit( 'cc.loadVideo' );
			$rootScope.cc.mode = 'video';
			$rootScope.cc.track = video.activeEl;
			$rootScope.cc.paused = true;
			$rootScope.videoPlayerReady = false
		})

		var default_attrs = {
			width:    options.width,
			height:   options.height,
			autoplay: true,
			loop:     false,
			poster:   ''
		}

		var defaults = {
			source:       null,
			alpha:        1,
			attrs:        {},
			crossfade:    false,    // integer || false
			alphaChannel: false,
			endCallback:  null,
			controls:     true,
			clickToPause: false,
			entry:        false,
		}

		defaults.attrs = extend( default_attrs, opts.attrs || {} );
		video.options = extend.call(this, defaults, opts || {});

		// string -> bool
		if( video.options.alphaChannel == 'false' )
			video.options.alphaChannel = false;

		if(!video.options.source) {
			console.warn('[compositor] Can’t load video with no source');
			return;
		}

		$timeout(function(){
			$rootScope.videoPlayer = video.options.controls
			$rootScope.clickToPause = video.options.clickToPause
		})

		ready = false

		$rootScope.$broadcast('gogo-scrubber', 'video') // tell the scrubber to query duration

		if( detect.mobile ) {

			// MOBILE ********************************************************

			// stage 4 & 6 vids have alpha channels, so use noalpha versions
			var stage = video.options.source.slice(0,1)
			if( stage == 4 || stage == 6 )
				video.options.source += '-noalpha'

			if( video.options.source.indexOf('entry') !== -1)
				video.options.source += '-noalpha'

			video.activeEl.src = ''
			video.activeEl.src = getVideoSrc( video.options.source )

			video.activeEl.load();

			return;

		} else {

			// NOT MOBILE ********************************************************

			if( detect.WebGL ){
				if( video.options.alphaChannel ) clearCanvas = true;
				else                             clearCanvas = false;
			} else {

				// stage 4 & 6 vids have alpha channels, so use noalpha versions
				var stage = video.options.source.slice(0,1)
				if( stage == 4 || stage == 6 )
					video.options.source += '-noalpha'

				clearCanvas = false;
			}



			// Crossfade
			// ~~~~~~~~~

			if(typeof video.options.crossfade === 'number'){

				// Switch active element

				if(video.active === 'A'){

					video.activeEl = video.B;
					video.active = 'B';
					video.inactiveEl = video.A;

				} else {

					video.activeEl = video.A;
					video.active = 'A';
					video.inactiveEl = video.B;
				}

				// Set up tween to fade out old (inactive) element

				video.inactiveEl.opacity = 1;

				if( ! $rootScope.muted )
					video.inactiveEl.volume = 1;

				oldOutTween = new TWEEN.Tween({ fade: video.inactiveEl.opacity })
					.to( { fade: 0 }, video.options.crossfade )
					.easing(TWEEN.Easing.Sinusoidal.InOut)
					.onUpdate(function(){

						video.inactiveEl.style.opacity = this.fade;
						video.inactiveEl.opacity = this.fade;
						video.inactiveEl.volume  = this.fade;
					})
					.onComplete(function(){
						video.crossfading = false;
						video.inactiveEl.pause();
					})

			}

			// Set up tween to fade in new (active) element
			// (triggered on canplaythrough)

			video.activeEl.opacity = 0;
			video.activeEl.volume = 0;

			newInTween = new TWEEN.Tween({ fade: video.activeEl.opacity })
				.to( { fade: 1 }, video.options.crossfade )
				.easing(TWEEN.Easing.Sinusoidal.InOut)
				.onUpdate(function(){

					video.activeEl.style.opacity = this.fade;
					video.activeEl.opacity = this.fade;

					if( ! $rootScope.muted )
						video.activeEl.volume  = this.fade;
				})



			// Entry Video Fade
			// ~~~~~~~~~~~~~~~~

			if( video.options.entry ){

				var fade = function(){
					if( (video.activeEl.duration - video.activeEl.currentTime) > 1 ){
						// regular fade
						video.activeEl.opacity = 1 - ( 0.8 * (video.activeEl.currentTime / video.activeEl.duration ) );

					} else {
						// last second, fade vid out completely
						video.activeEl.opacity = 0.2 * (video.activeEl.duration - video.activeEl.currentTime)
					}

				}

				video.activeEl.opacity = 1
				video.activeEl.volume = 1

				frameRunner.add('entry-fade', 'everyFrame', fade)

			}

			// Load Video
			// ~~~~~~~~~~

			video.activeEl.src = getVideoSrc( video.options.source );

			// Apply <video> tag attributes
			if(video.options.attrs) {
				for (var att in video.options.attrs) {
					if(video.options.attrs[att]) video.activeEl.setAttribute(att, video.options.attrs[att]);
					else                         video.activeEl.removeAttribute(att);
				}
			}

			video.activeEl.load();
			setCompositeMode();

			video.activeEl.play();

			start();

		}
	}

	var switchVideoResolution = function(){
		loadVideo( video.options )
	}




	//  #####  ##   ## ######  ####  ######
	// ##   ## ##   ## ##   ##  ##  ##    ##
	// ####### ##   ## ##   ##  ##  ##    ##
	// ##   ## ##   ## ##   ##  ##  ##    ##
	// ##   ##  #####  ######  ####  ######

	var loadAudio = function( trackName ){

		if(transitioning) {
			defer( function(){ loadAudio(trackName) } );
			return;
		}

		audio = audioControl.playfx( trackName )
		audio.playing = false

		$timeout(function(){
			$rootScope.cc.mode = 'audio';
			$rootScope.cc.track = audio;
			$rootScope.videoPlayerReady = false;
			$rootScope.$broadcast('gogo-scrubber', 'audio')
		})

		audio.off('load');
		audio.on('load',function(){

			audio.off('load')

			ready = true;

			if( $rootScope.mobile ) return

			start();

		})

		audio.off('play');
		audio.on('play', function(){

			$timeout(function(){
				$rootScope.$emit('cc.canplaythrough')
				$rootScope.$emit('cc.play');
				$rootScope.cc.playing = true;
				$rootScope.videoPlayerReady = true;
			})
		})

		audio.off('ended')
		audio.on('ended', function(){

			audio.off('ended')
			audio.off('play')
			audio.off('pause')

			$rootScope.$emit('cc.ended');
			destroy();
		})

		return audio
	}










	// ###### #####   #####  ###  ##  ####  #### ###### ####  ######  ###  ##
	//   ##   ##  ## ##   ## #### ## ##      ##    ##    ##  ##    ## #### ##
	//   ##   #####  ####### ## ####  ####   ##    ##    ##  ##    ## ## ####
	//   ##   ##  ## ##   ## ##  ###     ##  ##    ##    ##  ##    ## ##  ###
	//   ##   ##  ## ##   ## ##   ## #####  ####   ##   ####  ######  ##   ##

	var videoTransition = function( source, track ){

		var destroyer
		,   destroythis
		,   playthis
		,   pausethis

		var ready = function(){

			transition_video.removeEventListener('canplaythrough', ready)
			$timeout(function(){ $rootScope.videoTransition = true })
			transition_video.play()
			transition_video.style.background = ''
			transition_video.style.opacity = 0

			new TWEEN.Tween({ opacity: 0 })
				.to( { opacity: 1 }, 1000 )
				.easing(TWEEN.Easing.Sinusoidal.InOut)
				.onUpdate(function(){ transition_video.style.opacity = this.opacity })
				.start();

			frameRunner.add('intro-audio-fade', 'everyFrame', fade)
		}

		var destroythis = function(){
			frameRunner.remove('intro-audio-fade', 'everyFrame')

			var newTween = new TWEEN.Tween({ opacity: transition_video.style.opacity })
				.to( { opacity: 0 }, 1000 )
				.easing(TWEEN.Easing.Sinusoidal.InOut)
				.onUpdate(function(){ transition_video.style.opacity = this.opacity })
				.onComplete(function(){
					$timeout(function(){
						$rootScope.videoTransition = false
						transition_video.src = ''
					})
				})
				.start();
		}

		var playthis = function(){  transition_video.play()  }
		var pausethis = function(){ transition_video.pause() }

		var fade = function(){
			transition_video.style.opacity = 1 - ( 0.6 * (track.currentTime() / track.duration() ) );
		}

		transition_video.addEventListener('canplaythrough', ready, false)

		transition_video.style.background = 'black'
		transition_video.src = getVideoSrc( source );
		transition_video.load();
		transition_video.play();

		track.on( 'ended', destroythis )
		track.on( 'play',  playthis )
		track.on( 'pause', pausethis )

		destroyer = $rootScope.$on('cc.destroy', destroythis )

	}







	// ###  ### ##   ## ###### ######
	// ######## ##   ##   ##   ##
	// ## ## ## ##   ##   ##   #####
	// ##    ## ##   ##   ##   ##
	// ##    ##  #####    ##   ######

	var mute = function(){

		if(transitioning) { defer( mute ); return; }

		if( video.activeEl ){
			video.activeEl.muted   = true;
			video.activeEl.volume  = 0;
		}

		if( video.inactiveEl){
			video.inactiveEl.muted = true;
			video.inactiveEl.volume = 0;
		}

	}

	var unmute = function(){

		if(transitioning) { defer( unmute ); return; }

		if( video.activeEl )
			if( video.activeEl.muted)
				video.activeEl.muted   = false;

		if( video.inactiveEl )
			if( video.inactiveEl.muted)
				video.inactiveEl.muted = false;

		video.activeEl.volume  = 1;
	}





	// var checkLagging = function(){

	//     var now = (new Date()).getTime() / 1000,
	//         timeElapsed = now - startedPlay + timeAtPlay,
	//         graceTime = 5; // wait 5 seconds before switching to lower res video

	//     // // we’re lagging!
	//     // if( video.activeEl.currentTime < timeElapsed - graceTime ){

	//     //     video.activeEl.pause();
	//     //     frameRunner.remove('checkLagging','everySecond');
	//     //     $('#onf-hd').removeClass('active');
	//     //     $timeout(function(){
	//     //         $rootScope.video.resolution = 'low';
	//     //     })

	//     //     $timeout(function(){
	//     //         loadVideo( video.options );
	//     //     }, 250)


	//     // }

	// }







	//  ██████╗ ██████╗ ███╗   ██╗████████╗██████╗  ██████╗ ██╗
	// ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗██║
	// ██║     ██║   ██║██╔██╗ ██║   ██║   ██████╔╝██║   ██║██║
	// ██║     ██║   ██║██║╚██╗██║   ██║   ██╔══██╗██║   ██║██║
	// ╚██████╗╚██████╔╝██║ ╚████║   ██║   ██║  ██║╚██████╔╝███████╗
	//  ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝

	var playVideo = function(){

		if( !ready ) return;
		if(transitioning) { defer( playVideo ); return; }

		$rootScope.cc.playing = true;

		video.activeEl.play();
		start();

		$rootScope.$emit('cc.play');

	}


	var stopVideo = function( override ){

		// if( detect.mobile ) return;

		if( transitioning && ! override ) {
			defer( function(){ stopVideo(true); } );
			return;
		}

		$rootScope.cc.playing = false;
		video.activeEl.pause();
		// frameRunner.remove('checkLagging','everySecond');

		if( ! override ) trigger('ended');
	}


	var playPause = function( force ){

		if( transitioning ) return;

		if( force === 'pause' ) $rootScope.cc.playing = true;
		else if( force === 'play' ) $rootScope.cc.playing = false;

		if( $rootScope.cc.mode === 'video' ){

			if( $rootScope.cc.playing ){

				$rootScope.cc.playing = false;

				video.activeEl.pause();
				$rootScope.$emit('cc.pause');
				frameRunner.remove('helios-canvas-compositor', 'everyFrame');

			} else {

				frameRunner.add('helios-canvas-compositor', 'everyFrame', update);
				playVideo();

			}

		} else if( $rootScope.cc.mode === 'audio' ) {

			if( $rootScope.cc.playing ){
				$rootScope.cc.playing = false;
				if( audio ) audio.pause();
				$rootScope.$emit('cc.pause');
			} else {
				$rootScope.cc.playing = true;
				if( audio ) audio.play();
				$rootScope.$emit('cc.play');
			}

		}

	}




	// ██████╗  █████╗ ███████╗
	// ██╔══██╗██╔══██╗██╔════╝
	// ██████╔╝███████║█████╗
	// ██╔══██╗██╔══██║██╔══╝
	// ██║  ██║██║  ██║██║
	// ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝

	var imgData,
		alphaData;

	var update = function(){

		if( detect.mobile ) return;

		if( clearCanvas )
			target.ctx.clearRect(0,0, target.canvas.width, target.canvas.height);

		if( video.options.source && ( !ready || $rootScope.cc.mode !== 'video') ){

			return

			// target.ctx.fillStyle   = '#000000';
			// target.ctx.globalAlpha = 0.5;
			// target.ctx.fillRect(0,0,target.w,target.h);
			// target.ctx.globalAlpha = 1;


		} else if( video.options.source && ready || $rootScope.cc.mode === 'video' ) {

			if(video.crossfading) {

				target.ctx.globalAlpha = video.inactiveEl.opacity;
				target.ctx.drawImage(video.inactiveEl, 0,0, target.w, target.h);
				target.ctx.globalAlpha = 1;
			}

			target.ctx.globalAlpha = video.activeEl.opacity;

			// Alpha Channel
			// ~~~~~~~~~~~~~

			if( video.options.alphaChannel ) {

				if( detect.WebGL ) {

					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
					gl.UNSIGNED_BYTE, video.activeEl);

					gl.drawArrays(gl.TRIANGLES, 0, 6);

					target.ctx.drawImage(glCanvas, 0,0, target.w, target.h);

				} else {

					// just draw the video
					target.ctx.globalAlpha = video.activeEl.opacity;
					target.ctx.drawImage(video.activeEl, 0,0, target.w, target.h);
					target.ctx.globalAlpha = 1;

					// if( video.options.alphaChannel === 'split' ) {

					//     // get video & alpha image data

					//     bufferCtx.drawImage( video.activeEl, 0,0, buffer.width, buffer.height );

					//     imgData   = bufferCtx.getImageData( 0,0, buffer.width, buffer.height/2 );
					//     alphaData = bufferCtx.getImageData( 0,buffer.height/2, buffer.width, buffer.height/2 );

					//     // interpret alpha channel

					//     for (var i = 3, len = imgData.data.length; i < len; i = i + 4) {
					//         imgData.data[i] = 128 + alphaData.data[i - 1]; // calculate luminance from buffer part, no weigthing needed when alpha mask is used
					//     }

					//     bufferCtx.putImageData( imgData, 0,0, 0,0, buffer.width, buffer.height/2 );
					//     target.ctx.drawImage(buffer, 0,0, target.w, target.h*2);

					// } else if( video.options.alphaChannel === 'same' ){

					//     // get video & alpha image data

					//     bufferCtx.drawImage( video.activeEl, 0,0, buffer.width, buffer.height/2 );

					//     imgData   = bufferCtx.getImageData( 0,0, buffer.width, buffer.height/2 );
					//     alphaData = bufferCtx.getImageData( 0,0, buffer.width, buffer.height/2 );

					//     // interpret alpha channel

					//     for (var j = 3, len2 = imgData.data.length; j < len2; j = j + 4) {
					//         imgData.data[j] = 128 + alphaData.data[j - 1]; // calculate luminance from buffer part, no weigthing needed when alpha mask is used
					//     }

					//     bufferCtx.putImageData( imgData, 0,0, 0,0, buffer.width, buffer.height/2 );
					//     target.ctx.drawImage(buffer, 0,0, target.w, target.h*2);

					// }

				}


			} else {


				// just draw the video
				target.ctx.globalAlpha = video.activeEl.opacity;
				target.ctx.drawImage(video.activeEl, 0,0, target.w, target.h);
				target.ctx.globalAlpha = 1;

			}

			target.ctx.globalAlpha = 1;

		}

		// target.ctx.globalCompositeOperation = globalCompositeMode;

		// Effects
		for (var effect in effects) {
			if (effects.hasOwnProperty(effect))  {
				effects[effect].update();

				target.ctx.globalAlpha = effects[effect].opacity;
				// target.ctx.globalAlpha = 0.5;
				target.ctx.drawImage(effects[effect].canvas, 0,0, target.w, target.h);
				target.ctx.globalAlpha = 1;
			}
		}


	}

















	// ███████╗███████╗███████╗███████╗ ██████╗████████╗███████╗
	// ██╔════╝██╔════╝██╔════╝██╔════╝██╔════╝╚══██╔══╝██╔════╝
	// █████╗  █████╗  █████╗  █████╗  ██║        ██║   ███████╗
	// ██╔══╝  ██╔══╝  ██╔══╝  ██╔══╝  ██║        ██║   ╚════██║
	// ███████╗██║     ██║     ███████╗╚██████╗   ██║   ███████║
	// ╚══════╝╚═╝     ╚═╝     ╚══════╝ ╚═════╝   ╚═╝   ╚══════╝

	// set composite mode to source-over when there's just the video playing,
	// otherwise the video won’t be drawn. Call this whenever you change the
	// number of effect layers.

	var setCompositeMode = function(){

		if( detect.mobile ) return; // no compositing: stick with source-over

		// if we have video+effects, alpha blend, otherwise just paint
		// if( video.playing && video.options.alphaChannel && effects.length > 0 )
		if( $rootScope.cc.playing && effects.length > 0 )
			globalCompositeMode = 'destination-out';
		else
			globalCompositeMode = 'source-over';
	}



	var createEffect = function(name, type, opts){

		if( detect.mobile ) return;

		if(transitioning) {
			defer( function() { createEffect(name, type, opts) } );
			return;
		}

		if(effect_lookup[name]) {
			console.warn('[compositor] An effect named "%s" already exists.', name);
			return;
		} else {

			var effect;

			switch(type) {

				case 'particle':
					effect = new Particle(name, opts);
					break;

				case 'gradient':
					effect = new Gradient(name, opts);
					break;

				case 'image':
					effect = new ImageEffect(name, opts);
					break;

				default:
					console.warn('No effect of type "%s" exists', type);
					return;
			}

			effects.push(effect);
			effect_lookup[name] = effect;

			setCompositeMode();
			clearCanvas = true;

			start();
		}

	}


	// convencience method
	var createEffects = function(array){

		if(transitioning) {
			defer( function(){ createEffects(array) } );
			return;
		}

		for (var i = 0; i < array.length; i++) {
			createEffect(array[i].name, array[i].type, array[i].opts);
		}
	}





	var removeEffect = function( name, fadeTime ){

		var effect = effect_lookup[ name ];

		if(!effect) {
			console.warn('[compositor] Can’t remove "%s": no effect with that name exists.', name);
			return;
		}

		var doIt = function(){

			var rest,
				arr   = effects,
				total = arr.length;

			for ( var i = 0; i < total; i++ ){
				if ( arr[i] && arr[i].name == name ) {
					rest = arr.slice(i + 1 || total);
					arr.length = i < 0 ? total + i : i;
					arr.push.apply( arr, rest );
				}
			}

			effect = null;
			delete effect_lookup[name];

			setCompositeMode();
		}

		if(typeof fadeTime === 'number') {

			effect.tween = new TWEEN.Tween({ opacity: effect.opacity })
				.to( { opacity: 0 }, fadeTime )
				.easing(TWEEN.Easing.Sinusoidal.InOut)
				//.onStart(function(){})
				.onUpdate(function(){
					effect.opacity = this.opacity;
				})
				.onComplete(function(){ doIt(); })
				.start();

		} else {
			doIt();
		}

	}



	var removeAllEffects = function( fadeTime, callback ){

		if( detect.mobile ) return;

		for (var i = 0; i < effects.length; i++) {
			removeEffect( effects[i].name, fadeTime )
		}

		if(callback)
			if( typeof callback === 'function')
				callback();

	}











	// ██████╗  █████╗ ███████╗███████╗
	// ██╔══██╗██╔══██╗██╔════╝██╔════╝
	// ██████╔╝███████║███████╗█████╗
	// ██╔══██╗██╔══██║╚════██║██╔══╝
	// ██████╔╝██║  ██║███████║███████╗
	// ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝

	// Base class: all effects inherit it

	var BaseEffect = function(){

		var self = this;

		self.canvas = document.createElement('canvas');
		self.ctx = self.canvas.getContext('2d');

		self.canvas.width = 640;
		self.canvas.height = 360;

		self.type = null;
		self.name = '';
		self.ready = false;
		self.options = false;

		self.opacity = 1;
		self.tween = null;
	}

	BaseEffect.prototype.fade = function(){

		var self = this;

		if( ! self.options ) return;

		self.opacity = 0;

		this.effect = new TWEEN.Tween({ opacity: self.opacity })
			.to( { opacity: 1 }, self.options.fadeIn )
			.easing(TWEEN.Easing.Sinusoidal.InOut)
			//.onStart(function(){})
			.onUpdate(function(){
				self.opacity = this.opacity
			})
			//.onComplete(function(){})
			.start();

	}

	BaseEffect.prototype.update = function(){}; // rAF draw function

	// ********************************************************






	// ██╗███╗   ███╗ █████╗  ██████╗ ███████╗
	// ██║████╗ ████║██╔══██╗██╔════╝ ██╔════╝
	// ██║██╔████╔██║███████║██║  ███╗█████╗
	// ██║██║╚██╔╝██║██╔══██║██║   ██║██╔══╝
	// ██║██║ ╚═╝ ██║██║  ██║╚██████╔╝███████╗
	// ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝


	var ImageEffect = function(name, opts){

		var self = this;

		var defaults = {
			fadeIn: false,
			source: null,
			blendMode : 'destination-out',
			opacity: 1
		}
		self.options = extend.call( this, defaults, opts || {} );

		if(self.options.fadeIn) self.fade();

		self.type = 'image';
		self.name = name;

		self.opacity = self.options.opacity;

		if(self.options.width)  self.canvas.width  = self.options.width;
		if(self.options.height) self.canvas.height = self.options.height;

		self.ready = false;

		var imageObj = new Image();
		imageObj.onload = function() {
			self.ctx.drawImage( imageObj, 0,0, self.canvas.width, self.canvas.height );
		};
		if(self.options.source)
			imageObj.src = self.options.source;
		else
			console.warn('[Compositor] missing source for effect "%s" ', name)

		this.update = function(){};
	}

	ImageEffect.prototype = new BaseEffect();





	// ██████╗  █████╗ ██████╗ ████████╗██╗ ██████╗██╗     ███████╗
	// ██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██║██╔════╝██║     ██╔════╝
	// ██████╔╝███████║██████╔╝   ██║   ██║██║     ██║     █████╗
	// ██╔═══╝ ██╔══██║██╔══██╗   ██║   ██║██║     ██║     ██╔══╝
	// ██║     ██║  ██║██║  ██║   ██║   ██║╚██████╗███████╗███████╗
	// ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝╚══════╝╚══════╝

	var Particle = function(name, opts){

		var defaults = {
			fadeIn: false,
			count:    8,
			alpha:  0.2,
			minVelocity: 0.5,
			maxVelocity: 1.5,
			imgSource: 'assets/img/smoke_01.png',
		}
		this.options = extend.call(this, defaults, opts || {});

		if(this.options.fadeIn) this.fade();

		this.type = 'particle';
		this.name = name;

		var particles = [];

		if(this.options.width) this.canvas.width = this.options.width;
		if(this.options.height) this.canvas.height = this.options.height;

		var w = this.canvas.width,
			h = this.canvas.height;

		for(var i=0; i < this.options.count; ++i){

			var particle = new P(this.ctx);

			// Set the position to be inside the canvas bounds
			particle.setPosition(rand(0, w), rand(0, h));

			// Set the initial velocity to be either random and either negative or positive
			particle.setVelocity(rand(-this.options.minVelocity, this.options.maxVelocity), rand(-this.options.minVelocity, this.options.maxVelocity));

			particles.push(particle);
		}

		var imageObj = new Image();
		imageObj.onload = function() {
			particles.forEach(function(particle) {
				particle.setImage(imageObj);
			});
		};
		imageObj.src = this.options.imgSource;


		this.update = function(){

			this.ctx.clearRect(0,0, this.canvas.width, this.canvas.height);

			this.ctx.globalAlpha = this.options.alpha;
			for (var i = particles.length - 1; i >= 0; i--) {
				particles[i].update();
			}
			this.ctx.globalAlpha = 1;
		}


		function P(_context) {

			this.x = 0;
			this.y = 0;
			this.xVelocity = 0;
			this.yVelocity = 0;
			this.context = _context;

			// Update the particle.
			this.update = function() {
				// Update the position of the particle with the addition of the velocity.
				this.x += this.xVelocity;
				this.y += this.yVelocity;

				// Check if has crossed the right edge
				if (this.x >= w) {
					this.xVelocity = -this.xVelocity;
					this.x = w;
				}
				// Check if has crossed the left edge
				else if (this.x <= 0) {
					this.xVelocity = -this.xVelocity;
					this.x = 0;
				}

				// Check if has crossed the bottom edge
				if (this.y >= h) {
					this.yVelocity = -this.yVelocity;
					this.y = h;
				}

				// Check if has crossed the top edge
				else if (this.y <= 0) {
					this.yVelocity = -this.yVelocity;
					this.y = 0;
				}

				if(this.image) {
					this.context.mobile(this.image, this.x-128, this.y-128);
				}


			};

			// A function to set the position of the particle.
			this.setPosition = function(x, y) {
				this.x = x;
				this.y = y;
			};

			// Function to set the velocity.
			this.setVelocity = function(x, y) {
				this.xVelocity = x;
				this.yVelocity = y;
			};

			this.setImage = function(image){
				this.image = image;
			}
		}
	}


	Particle.prototype = new BaseEffect();










	//  ██████╗ ██████╗  █████╗ ██████╗ ██╗███████╗███╗   ██╗████████╗
	// ██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██║██╔════╝████╗  ██║╚══██╔══╝
	// ██║  ███╗██████╔╝███████║██║  ██║██║█████╗  ██╔██╗ ██║   ██║
	// ██║   ██║██╔══██╗██╔══██║██║  ██║██║██╔══╝  ██║╚██╗██║   ██║
	// ╚██████╔╝██║  ██║██║  ██║██████╔╝██║███████╗██║ ╚████║   ██║
	//  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝
	//
	// start: 0-1 (percent of canvas height)
	// end:   0-1 "
	// direction: 'up', 'down' (fade up or fade down)

	var Gradient = function(name, opts){

		var self = this;

		// All coordinates in percent, starting from top left
		// starts: opaque, end: transparent

		var defaults = {
			fadeIn: false,
			start: 0.0,
			end:   1.0,
			direction : 'down',
		}
		this.options = extend.call(this, defaults, opts || {});

		if(self.options.fadeIn) self.fade();

		this.type = 'gradient';
		this.name = name;

		// Create the gradient (once!!)
		// ~~~~~~~~~~~~~~~~~~~

		var x1 = 0,
			x2 = this.canvas.width;

		var startY = this.canvas.height * this.options.start,
			endY = this.canvas.height * this.options.end;

		var startColor = 'rgba(0,0,0,0)',
			endColor   = 'rgba(0,0,0,255)';

		if(this.options.direction === 'up') {
			startColor = 'rgba(0,0,0,255)';
			endColor   = 'rgba(0,0,0,0)';
		}

		var gradient;

		this.ctx.clearRect(0,0, this.canvas.width, this.canvas.height);

		gradient = this.ctx.createLinearGradient(0, startY, 0, endY); // x1,startY, x2,endY
		gradient.addColorStop(0, startColor);
		gradient.addColorStop(1, endColor);

		this.ctx.fillStyle = gradient;
		// this.ctx.fillStyle = 'rgba(0,0,0,0.5)';

		this.ctx.fillRect(x1,startY, x2,endY);


		// Fill the ends

		if( this.options.direction === 'down' && this.options.end < 1 ) {
			this.ctx.fillStyle = 'rgba(0,0,0,255)';
			this.ctx.fillRect(x1, endY, x2, this.canvas.height);
		}

		if( this.options.direction === 'up' && this.options.start > 0 ) {
			this.ctx.fillStyle = 'rgba(0,0,0,255)';
			this.ctx.fillRect(x1, 0, x2, startY);
		}




		this.update = function(){}; // no update required


	}

	Gradient.prototype = new BaseEffect();








	var updateTween = function(){
		TWEEN.update();
	}


	return {

		// Methods

		init : init, // set dom elements

		createEffect: createEffect,
		removeEffect: removeEffect,

		removeAllEffects : removeAllEffects,

		preloadVideo: preloadVideo,
		playVideo:    playVideo,
		stopVideo:    stopVideo,

		loadVideo:      loadVideo,
		loadAudio:      loadAudio,
		videoTransition: videoTransition,

		start: start,
		destroy:  destroy,
		reset: reset,

		playPause: playPause,

		mute:   mute,
		unmute: unmute,

		update : update,
		resize : resize,

		on: on,
		off: off,

		updateTween : updateTween,

		switchVideoResolution: switchVideoResolution,

		// Properties

		effects : effect_lookup,
		video : video,

		events: events

	}



	}]);

})(window, window.angular);