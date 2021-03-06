// 'use strict';
var rest_client 	= require('node-rest-client').Client;
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.VLC_IS_STOPPED = 0;
	self.VLC_IS_PAUSED = 1;
	self.VLC_IS_PLAYING = 2;
	self.VLC_IS_STOPPING = 3;

	self.actions(); // export actions

	if (process.env.DEVELOPER) {
		self.config._configIdx = -1;
	}

	self.addUpgradeScript(function () {
		// just an example - has to live on though
		if (self.config.host !== undefined) {
			//self.config.old_host = self.config.host;
		}
	});

	self.addUpgradeScript(function () {
		var changed = false;

		if (self.config.host == undefined || self.config.host == '') {
			self.config.host = '127.0.0.1';
			changed = true;
		}
		return changed;
	});

	return self;
}

instance.prototype.MSTATUS_CHAR = {
	running: "\u23F5",
	paused: "\u23F8",
	stopped: "\u23F9"
};

instance.prototype.updateConfig = function (config) {
	var self = this;

	self.config = config;
	self.startup();
};

instance.prototype.init = function() {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.startup();
};

function vlc_MediaInfo (info) {
	if (info) {
		this.id = info.id;
		this.duration = info.duration;
		this.uri = info.uri;
		this.name = info.name;
	} else {
		this.id = 0;
		this.duration = 0;
		this.uri = '';
		this.name = '';
	}
}

instance.prototype.titleMunge = function(t) {
	var self = this;

	return (t.length > 20 ? t = t.slice(0,10) + t.slice(-10) : t);
};

instance.prototype.clear = function () {
	var self = this;

	self.status(self.STATUS_WARNING,"Initializing");
	
	if (self.plPoll) {
		clearInterval(self.plPoll);
		delete self.plPoll;
	}
	if (self.pbPoll) {
		clearInterval(self.pbPoll);
		delete self.pbPoll;
	}
	if (self.client) {
		delete self.client;
	}
	self.baseURL = '';
	self.PlayIDs = [];
	self.PlayList = {};
	self.PlayState = self.VLC_IS_STOPPED;
	self.NowPlaying = 0;
	self.PollCount = 0;
	self.vlcVersion = '';
	self.PlayStatus = {
		title: '',
		num: 0,
		length: 0,
		position: 0,
		time: 0
	};
	self.hires = (self.config.hires ? true : false);
	self.PlayLoop = false;
	self.PlayRepeat = false;
	self.PlayRandom = false;
	self.PlayFull = false;
	self.lastStatus = -1;
};

instance.prototype.startup = function() {
	var self = this;

	self.clear();
	if (self.config.host && self.config.port) {
		self.init_client();
		self.init_variables();
		self.init_feedbacks();
		self.init_presets();
		self.plPoll = setInterval(function() { self.pollPlaylist(); }, 500);
		self.pbPoll = setInterval(function() { self.pollPlayback(); }, 100);
	} else {
		self.status(self.STATUS_WARNING,"No host configured");
	}
};

instance.prototype.init_client = function() {
	var self = this;


	self.baseURL = 'http://' + self.config.host +':'+ self.config.port;
	self.auth = {};

	if (self.config.password) {
		self.auth = { headers: { "Authorization": "Basic " + Buffer.from(['',self.config.password].join(":")).toString("base64") }};
	}

	self.client = new rest_client();

	self.status(self.STATUS_WARNING, 'Connecting');

	self.client.on('error', function(err) {
		if (self.lastStatus != self.STATUS_ERR) {
			self.status(self.STATUS_ERROR, err);
			self.lastStatus = self.STATUS_ERR;
		}
	});
};

// feedback definitions
instance.prototype.init_feedbacks = function() {
	var self = this;

	var feedbacks = {
		c_status: {
			label: 'Color for Player State',
			description: 'Set Button colors for Player State',
			options: [{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: '16777215'
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: rgb(128, 0, 0)
			},
			{
				type: 'dropdown',
				label: 'Which Status?',
				id: 'playStat',
				default: '0',
				choices: [
					{ id: '0', label: 'Stopped' },
					{ id: '1', label: 'Paused' },
					{ id: '2', label: 'Playing'}
				]
			}],
			callback: function(feedback, bank) {
				var ret = {};
				var options = feedback.options;

				if (self.PlayState == parseInt(options.playStat)) {
					ret = { color: options.fg, bgcolor: options.bg };
				} else if (self.PlayState == parseInt(options.playStat)) {
					ret = { color: options.fg, bgcolor: options.bg };
				} else if (self.PlayState == parseInt(options.playStat)) {
					ret = { color: options.fg, bgcolor: options.bg };
				}
				return ret;
			}
		},
		c_loop: {
			label: 'Loop mode Color',
			description: 'Button colors when Player in Loop mode',
			options: [{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: '16777215'
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: rgb(0, 128, 128)
			}],
			callback: function(feedback, bank) {
				var options = feedback.options;
				return (self.PlayLoop ? { color: options.fg, bgcolor: options.bg } : {});
			}
		},
		c_repeat: {
			label: 'Repeat mode Color',
			description: 'Button colors when Player in Repeat mode',
			options: [{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: '16777215'
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: rgb(128, 0, 128)
			}],
			callback: function(feedback, bank) {
				var options = feedback.options;
				return (self.PlayRepeat ? { color: options.fg, bgcolor: options.bg } : {});
			}
		},
		c_random: {
			label: 'Shuffle mode Color',
			description: 'Button colors when Player in Shuffle mode',
			options: [{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: '16777215'
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: rgb(0, 0, 128)
			}],
			callback: function(feedback, bank) {
				var options = feedback.options;
				return (self.PlayRandom ? { color: options.fg, bgcolor: options.bg } : {});
			}
		},
		c_full: {
			label: 'Full Screen Color',
			description: 'Button colors when Player is Full Screen',
			options: [{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: '16777215'
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: rgb(204, 0, 128)
			}],
			callback: function(feedback, bank) {
				var options = feedback.options;
				return (self.PlayFull ? { color: options.fg, bgcolor: options.bg } : {});
			}
		}
	};
	self.setFeedbackDefinitions(feedbacks);
};


// define instance variables
instance.prototype.init_variables = function() {
	var self = this;

	var variables = [
		{
			label: 'VLC Version',
			name:  'v_ver'
		},
		{
			label: 'Playing Status',
			name:  'r_stat'
		},
		{
			label: 'Playing Item VLC ID',
			name:  'r_id'
		},
		{
			label: 'Playing Item Name',
			name:  'r_name'
		},
		{
			label: 'Playing Item Playlist Number',
			name:  'r_num'
		},
		{
			label: 'Playing Item Time left, variable size',
			name:  'r_left'
		},
		{
			label: 'Playing Item Time left, HH:MM:SS',
			name:  'r_hhmmss'
		},
		{
			label: 'Playing Item Time left, Hour',
			name:  'r_hh'
		},
		{
			label: 'Playing Item Time left, Minute',
			name:  'r_mm'
		},
		{
			label: 'Playing Item Time left, Second',
			name:  'r_ss'
		}
	];

	self.setVariableDefinitions(variables);
};

instance.prototype.updatePlaylist = function(data) {
	var self = this;
	var pList = JSON.parse(data.toString());
	var newList;

	if (pList.children) {
		newList = pList.children;
	}

	for (var i in newList) {
		if (newList[i].name == 'Playlist') {
			var nl = newList[i].children;
			var pl = self.PlayIDs;
			if (nl.length != pl.length || pl.length == 0 || nl[0].id != pl[0]) {
				self.PlayList = {};
				var m, p;
				for (p in pl) {
					self.setVariable('pname_' + (parseInt(p) + 1));
				}
				pl = [];
				for (p in newList[i].children) {
					m = new vlc_MediaInfo(newList[i].children[p]);
					self.PlayList[m.id] = m;
					pl.push(m.id);
				}
				
				self.PlayIDs = pl; 
				for (p in self.PlayIDs) {
					self.setVariable('pname_' + (parseInt(p) + 1), self.PlayList[self.PlayIDs[p]].name);
				}
			}
		}
	}
};

instance.prototype.updateStatus = function() {
	var self = this;

	var tenths = (self.config.useTenths ? 0 : 1);
	var ps = self.PlayStatus;
	var state = self.PlayState;

	var tLeft = ps.length * (1 - ps.position);
	if (tLeft > 0) {
		tLeft += tenths;
	}
	var h = Math.floor(tLeft / 3600);
	var hh = ('00' + h).slice(-2);
	var m = Math.floor(tLeft / 60) % 60;
	var mm = ('00' + m).slice(-2);
	var s = Math.floor(tLeft % 60);
	var ss = ('00' + s).slice(-2);
	var ft = '';

	if (hh > 0) {
		ft = hh + ":";
	}
	if (mm > 0) {
		ft = ft + mm + ":";
	}
	ft = ft + ss;

	if (tenths == 0) {
		var f = Math.floor((tLeft - Math.trunc(tLeft)) * 10);
		var ms = ('0' + f).slice(-1);
		if (tLeft < 5 && tLeft != 0) {
			ft = ft.slice(-1) + "." + ms;
		}
	}

	self.setVariable('v_ver', self.vlcVersion);
	self.setVariable('r_id', self.NowPlaying);
	self.setVariable('r_name', ps.title);
	self.setVariable('r_num', ps.num);
	self.setVariable('r_stat', state == self.VLC_IS_PLAYING ? self.MSTATUS_CHAR.running :
							state == self.VLC_IS_PAUSED ? self.MSTATUS_CHAR.paused :
							self.MSTATUS_CHAR.stopped);
	self.setVariable('r_hhmmss',hh + ":" + mm + ":" + ss);
	self.setVariable('r_hh', hh);
	self.setVariable('r_mm', mm);
	self.setVariable('r_ss', ss);
	self.setVariable('r_left',ft);
	self.checkFeedbacks();
};

instance.prototype.updatePlayback = function(data) {
	var self = this;

	var stateChanged = false;

	var pbInfo = JSON.parse(data.toString());
	var wasPlaying = pbStat({ currentplid: self.NowPlaying, position: self.PlayStatus.position });
	self.vlcVersion = pbInfo.version;

	function pbStat(info) {
		return info.currentplid + ':' + info.position + ':' + self.PlayState;
	}

	///
	/// pb vars and feedback here
	///
	stateChanged = stateChanged || (self.PlayState != (self.PlayState = ['stopped','paused','playing'].indexOf(pbInfo.state)));
	stateChanged = stateChanged || (self.PlayRepeat != (self.PlayRepeat = (pbInfo.repeat ? true : false)));
	stateChanged = stateChanged || (self.PlayLoop != (self.PlayLoop = (pbInfo.loop ? true : false)));
	stateChanged = stateChanged || (self.PlayRandom != (self.PlayRandom = (pbInfo.random ? true : false)));
	stateChanged = stateChanged || (self.PlayFull != (self.PlayFull = (pbInfo.fullscreen ? true : false)));
	if (pbInfo.currentplid < 2) {
		self.PlayStatus.title = '';
		self.PlayStatus.length = 0;
		self.PlayStatus.position = 0;
		self.PlayStatus.time = 0;
		self.PlayStatus.num = 0;
		self.NowPlaying = pbInfo.currentplid;
	} else if (self.PlayIDs.length > 0) {
		self.NowPlaying = pbInfo.currentplid;
		self.PlayStatus.title = self.titleMunge(self.PlayList[self.NowPlaying].name);
		self.PlayStatus.length = pbInfo.length;
		self.PlayStatus.position = pbInfo.position;
		self.PlayStatus.time = pbInfo.time;
		self.PlayStatus.num = 1 + self.PlayIDs.indexOf(pbInfo.currentplid.toString());
	}

	if (stateChanged) {
		self.checkFeedbacks();
	}
	
	if (pbStat(pbInfo) != wasPlaying) {
		self.updateStatus();
	}
};


instance.prototype.getRequest = function(url, cb) {
	var self = this;
	var emsg = '';
	
	self.client.get(self.baseURL + url, self.auth, function(data, response) {
		if (response.statusCode == 401) {
			// error/not found
			if (self.lastStatus != self.STATUS_WARNING) {
				emsg = response.statusMessage + '.\nBad Password?';
				self.status(self.STATUS_WARNING, emsg);
				self.log('error', emsg);
				self.lastStatus = self.STATUS_WARNING;
			}
		} else if (response.statusCode != 200) {
			if (self.lastStatus != self.STATUS_ERROR) {
				self.status(self.STATUS_ERROR, response.statusMessage);
				self.log('error', response.statusMessage);
				self.lastStatus = self.STATUS_ERROR;
			}
		} else {
			if (self.lastStatus != self.STATUS_OK) {
				self.status(self.STATUS_OK);
				self.log('info','Connected to ' + self.config.host + ':' + self.config.port);
				self.lastStatus = self.STATUS_OK;
			}
			cb.call(self,data);
		}
	}).on('error', function (err) {
		if (self.lastStatus != self.STATUS_ERROR) {
			emsg = err.message;
			self.log('error', emsg);
			self.status(self.STATUS_ERROR, emsg);
			self.lastStatus = self.STATUS_ERROR;
		}
	});
};

instance.prototype.pollPlaylist = function() {
	var self = this;
	var data;
		
	self.getRequest('/requests/playlist.json', self.updatePlaylist);

};


instance.prototype.pollPlayback = function() {
	var self = this;
	var data;

	// poll @ 500ms if not playing
	if (((self.PlayState != self.VLC_IS_STOPPED) && (self.hires))  || (self.PollCount % 5) == 0) {
		self.getRequest('/requests/status.json', self.updatePlayback);
	}
	
	self.PollCount += 1;
};


// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	self.clear();
	self.status(self.STATUS_UNKNOWN,'Disabled');

	debug("destroy");
};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 8,
			default: '127.0.0.1',
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Target Port',
			width: 4,
			default: 8080,
			regex: self.REGEX_PORT
		},
		{
			type: 'textinput',
			id: 'password',
			label: 'HTTP Password (required)',
			width: 8
		},
		{
			type: 'checkbox',
			id: 'hires',
			label: 'Increase timer resolution?',
			tooltip: 'Poll playback counter more frequently\nfor better response and resolution',
			default: false,
		}
	];
};

instance.prototype.init_presets = function () {
	var self = this;
	var presets = [

		{
			category: 'Player',
			label: 'Play',
			bank: {
				style: 'png',
				text: '',
				png64: self.ICON_PLAY_INACTIVE,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0,0,0),
			},
			actions: [
				{
					action: 'play',
					options: {}
				}
			],
			feedbacks: [
				{
					type:    'c_status',
					options: {
						fg: '16777215',
						bg: rgb(0, 128, 0),
						playStat: '2'
					}
				}
			]
		},
		{
			category: 'Player',
			label: 'Pause',
			bank: {
				style: 'png',
				text: '',
				png64: self.ICON_PAUSE_INACTIVE,
				pngalignment: 'center:center',
				size: '18',
				color: self.rgb(255,255,255),
				bgcolor: self.rgb(0, 0, 0),

			},
			actions: [
				{
					action: 'pause',
					options: {}
				}
			],
			feedbacks: [
				{
					type:    'c_status',
					options: {
						fg: '16777215',
						bg: rgb(128, 128, 0),
						playStat: '1'
					}
				}
			]
		},
		{
			category: 'Player',
			label: 'Stop',
			bank: {
				style: 'png',
				text: '',
				png64: self.ICON_STOP_INACTIVE,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'stop',
					options: {}
				}
			],
			feedbacks: [
				{
					type:    'c_status',
					options: {
						fg: '16777215',
						bg: rgb(128, 0, 0),
						playStat: '0'
					}
				}
			]
		},
		{
			category: 'Player',
			label: 'Loop',
			bank: {
				style: 'png',
				text: 'Loop Mode',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'loop',
					options: {}
				}
			],
			feedbacks: [
				{
					type:    'c_loop',
					options: {
						fg: '16777215',
						bg: rgb(0,128,128)
					}
				}
			]
		},
		{
			category: 'Player',
			label: 'Repeat',
			bank: {
				style: 'png',
				text: 'Repeat Mode',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'repeat',
					options: {}
				}
			],
			feedbacks: [
				{
					type:    'c_repeat',
					options: {
						fg: '16777215',
						bg: rgb(128, 0, 128),
						playStat: '0'
					}
				}
			]
		},
		{
			category: 'Player',
			label: 'Shuffle',
			bank: {
				style: 'png',
				text: 'Shuffle Mode',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'shuffle',
					options: {}
				}
			],
			feedbacks: [
				{
					type:    'c_random',
					options: {
						fg: '16777215',
						bg: rgb(0, 0, 128),
						playStat: '0'
					}
				}
			]
		},
		{
			category: 'Player',
			label: 'Full Screen',
			bank: {
				style: 'png',
				text: 'Full Screen Mode',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'full',
					options: {}
				}
			],
			feedbacks: [
				{
					type:    'c_full',
					options: {
						fg: '16777215',
						bg: rgb(204, 0, 128),
						playStat: '0'
					}
				}
			]
		}
	];

	for (var c = 1; c <=5; c++) {
		presets.push(
		{
			category: 'Play List',
			label: `Play #${c}`,
			bank: {
				style: 'png',
				text: `Play $(vlc:pname_${c})`,
				pngalignment: 'center:center',
				size: 'auto',
				color: self.rgb(164,164,164),
				bgcolor: self.rgb(0,0,0)
			},
			actions: [
				{
					action: 'playID',
					options: {
						clip: c
					}
				}
			]
		});
	}

	self.setPresetDefinitions(presets);
};

instance.prototype.actions = function(system) {
	var self = this;
	self.system.emit('instance_actions', self.id, {


		'play':   { label: 'Play'},
		'playID': { label: 'Play ID',
				options: [
					{
						type: 'textinput',
						label: 'Clip Nr.',
						id: 'clip',
						default: 1,
						regex: self.REGEX_NUMBER
					}
				]
			},
		'stop':   { label: 'Stop'},
		'pause':  { label: 'Pause / Resume'},
		'next':   { label: 'Next'},
		'prev':   { label: 'Previous'},
		'full':   { label: 'Full Screen'},
		'loop':   { label: 'Loop'},
		'shuffle':{ label: 'Shuffle'},
		'repeat': { label: 'Repeat'}


	});
};

instance.prototype.action = function(action) {
	var self = this;
	var cmd;
	var opt = action.options;
	var theClip = opt.clip;

	if (theClip) {
		theClip = self.PlayIDs[theClip - 1];
	}

	debug('action: ', action);

	switch (action.action) {

		case 'play':
			cmd = '?command=pl_play';
			break;

		case 'playID':
			cmd = '?command=pl_play&id=' + theClip;
			break;

		case 'stop':
			cmd = '?command=pl_stop';
			break;

		case 'pause':
			cmd = '?command=pl_pause';
			break;

		case 'next':
			cmd = '?command=pl_next';
			break;

		case 'prev':
			cmd = '?command=pl_previous';
			break;

		case 'full':
			cmd = '?command=fullscreen';
			break;

		case 'loop':
			cmd = '?command=pl_loop';
			break;

		case 'shuffle':
			cmd = '?command=pl_random';
			break;

		case 'repeat':
			cmd = '?command=pl_repeat';
			break;
	}

	if (cmd !== undefined) {
		self.client.get(self.baseURL + '/requests/status.json'+ cmd, self.auth, function(data, response) {
			if (self.lastStatus != self.STATUS_OK) {
				self.status(self.STATUS_OK);
				self.lastStatus = self.STATUS_OK;
			}
		}).on('error', function (err) {
			if (self.lastStatus != self.STATUS_ERROR) {
				self.log('error', err.message);
				self.status(self.STATUS_ERROR, err.message);
				self.lastStatus = self.STATUS_ERROR;
			}
		});
		// force an update if stopped
		self.PollCount = self.PollCount + (3 - (self.PollCount % 5));
	}

};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
