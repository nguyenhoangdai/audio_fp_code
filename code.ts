###########################################################################
# Copyright (C) 2022 Shekhar Chalise, Hoang Dai Nguyen                    #
# schalise@my.uno.edu , hdnguye5@my.uno.edu                               #
#                                                                         #
# Distributed under the GNU Public License v3.0	                          #
# https://www.gnu.org/licenses/gpl-3.0.en.html                            #
#                                                                         #
# This program is free software; you can redistribute it and/or modify    #
# it under the terms of the GNU General Public License as published by    #
# the Free Software Foundation; either version 3 of the License, or       #
# (at your option) any later version.                                     #
#                                                                         #
###########################################################################

import * as CodecDetect from "codec-detect";

// declare varibles
const FREQUENCY = 1e4;
const FREQUENCY_VALUE_AT_TIME = 440;

const OFFLINEAUDIOCTX = {
	numberOfChannels: 1,
	length: 44100,
	sampleRate: 44100,
};

const COMPRESSOR = {
	threshold: -50,
	knee: 40,
	ratio: 12,
	attack: 0,
	release: 0.25,
	reduction: -20,
};
const SCRIPT_PROCESSOR = {
	bufferSize: 4096,
	numberOfInputChannels: 1,
	numberOfOutputChannels: 1,
};

const SIGNAL_TYPE = "triangle";

// Fingerprinting techniques

function getAudioContextProperties() {
	try {
		const nt_vc_context = new ((<any>window).AudioContext ||
			(<any>window).webkitAudioContext)();
		if (!nt_vc_context) {
			return { hash: "Not available" };
		} else {
			let f = nt_vc_context,
				d = f.createAnalyser();
			this.contextProps = this.a({}, f, "ac-");
			this.contextProps = this.a(this.contextProps, f.destination, "ac-");
			this.contextProps = this.a(this.contextProps, f.listener, "ac-");
			this.contextProps = this.a(this.contextProps, d, "an-");
			this.contextProps = {
				...this.contextProps,
				...CodecDetect.getAudioSupport(),
			};
			this.contextProps_string = window.JSON.stringify(
				this.contextProps,
				undefined,
				2
			);
			this.contextPropsHash = CryptoJS.MD5(this.contextProps_string).toString();
			//alert("contexprops " + this.contextPropsHash)
			return { hash: this.contextPropsHash, values: this.contextProps };
		}
	} catch (g) {
		this.contextProps = 0;
		return { hash: "Not available" };
	}
}

function getDynamicCompressorFingerprint() {
	let sumBuffer = 0;
	let sumBufferHash = "";
	return new Promise((resolve, reject) => {
		try {
			let offlineAudioCtx = new ((<any>window).OfflineAudioContext ||
				(<any>window).webkitOfflineAudioContext)(
				OFFLINEAUDIOCTX.numberOfChannels,
				OFFLINEAUDIOCTX.length,
				OFFLINEAUDIOCTX.sampleRate
			);
			if (offlineAudioCtx) {
				let oscillator = offlineAudioCtx.createOscillator();
				oscillator.type = SIGNAL_TYPE;
				oscillator.frequency.value = FREQUENCY;

				// Create and configure compressor
				let compressor = offlineAudioCtx.createDynamicsCompressor();
				compressor.threshold &&
					(compressor.threshold.value = COMPRESSOR.threshold);
				compressor.knee && (compressor.knee.value = COMPRESSOR.knee);
				compressor.ratio && (compressor.ratio.value = COMPRESSOR.ratio);
				// compressor.reduction && (compressor.reduction.value = -20);
				compressor.attack && (compressor.attack.value = COMPRESSOR.attack);
				compressor.release && (compressor.release.value = COMPRESSOR.release);

				// Connect nodes
				oscillator.connect(compressor);
				compressor.connect(offlineAudioCtx.destination);

				// Start audio processing
				oscillator.start(0);
				offlineAudioCtx.startRendering();
				offlineAudioCtx.oncomplete = (evnt: any) => {
					sumBuffer = 0;
					let MD5 = CryptoJS.algo.MD5.create();
					for (let i = 0; i < evnt.renderedBuffer.length; i++) {
						MD5.update(evnt.renderedBuffer.getChannelData(0)[i].toString());
					}
					const hash = MD5.finalize();
					sumBufferHash = hash.toString(CryptoJS.enc.Hex);
					for (let i = 4500; 5e3 > i; i++) {
						sumBuffer += Math.abs(evnt.renderedBuffer.getChannelData(0)[i]);
					}
					oscillator.disconnect();
					//console.log({"dynamicCompressor": sumBufferHash, "sum": sumBuffer});
					//alert("dynamiccompressor " +sumBufferHash)
					resolve({
						hash: sumBufferHash,
						sum: sumBuffer,
						noFingerprint: false,
					});
				};
			} else {
				reject({ hash: sumBufferHash, sum: sumBuffer, noFingerprint: true });
			}
		} catch (u) {
			reject({ hash: sumBufferHash, sum: sumBuffer, noFingerprint: true });
		}
	});
}

function getOscillatorNodeFingerprint() {
	let oscillatorNode = [];
	let hash = "";
	return new Promise((resolve, reject) => {
		try {
			let audioCtx = new ((<any>window).AudioContext ||
				(<any>window).webkitAudioContext)();
			if (audioCtx) {
				let oscillator = audioCtx.createOscillator();
				let analyser = audioCtx.createAnalyser();
				let gain = audioCtx.createGain();
				let scriptProcessor = audioCtx.createScriptProcessor(
					SCRIPT_PROCESSOR.bufferSize,
					SCRIPT_PROCESSOR.numberOfInputChannels,
					SCRIPT_PROCESSOR.numberOfOutputChannels
				);
				gain.gain.value = 1; // Disable volume
				analyser.fftSize = 2048;
				oscillator.type = SIGNAL_TYPE; // Set oscillator to output wave
				//oscillator.frequency.setValueAtTime(freqVal.frequencyValueAtTimeFormControl, audioCtx.currentTime);
				oscillator.connect(analyser); // Connect oscillator output to analyser input
				analyser.connect(scriptProcessor); // Connect analyser output to scriptProcessor input
				scriptProcessor.connect(gain); // Connect scriptProcessor output to gain input
				gain.connect(audioCtx.destination); // Connect gain output to audiocontext destination

				scriptProcessor.onaudioprocess = async (event) => {
					const bins = new Float32Array(analyser.frequencyBinCount);
					analyser.getFloatFrequencyData(bins);
					for (let i = 0; i < bins.length; i++) {
						oscillatorNode.push(bins[i]);
					}
					//oscillatorNode.push(...bins); // used extend
					analyser.disconnect();
					scriptProcessor.disconnect();
					gain.disconnect();
					const audioFP = JSON.stringify(oscillatorNode);
					hash = CryptoJS.MD5(audioFP).toString();
					await audioCtx.close();
					resolve({
						hash: hash,
						values: oscillatorNode,
						noFingerprint: false,
					});
				};
				oscillator.start(0);
			} else {
				reject({ hash: hash, values: oscillatorNode, noFingerprint: true });
			}
		} catch (u) {
			reject({ hash: hash, values: oscillatorNode, noFingerprint: true });
		}
	});
}

function getHybridFingerprintWithAudioCtx() {
	let hybridOscillatorNode = [];
	let hybridHash = "";
	return new Promise((resolve, reject) => {
		try {
			let audioCtx = new ((<any>window).AudioContext ||
				(<any>window).webkitAudioContext)();
			if (audioCtx) {
				let oscillator = audioCtx.createOscillator();
				let analyser = audioCtx.createAnalyser();
				let gain = audioCtx.createGain();
				let scriptProcessor = audioCtx.createScriptProcessor(
					SCRIPT_PROCESSOR.bufferSize,
					SCRIPT_PROCESSOR.numberOfInputChannels,
					SCRIPT_PROCESSOR.numberOfOutputChannels
				);

				// Create and configure compressor
				let compressor = audioCtx.createDynamicsCompressor();
				compressor.threshold.setValueAtTime(
					COMPRESSOR.threshold,
					audioCtx.currentTime
				);
				compressor.knee.setValueAtTime(COMPRESSOR.knee, audioCtx.currentTime);
				compressor.ratio.setValueAtTime(COMPRESSOR.ratio, audioCtx.currentTime);
				compressor.attack.setValueAtTime(
					COMPRESSOR.attack,
					audioCtx.currentTime
				);
				compressor.release.setValueAtTime(
					COMPRESSOR.release,
					audioCtx.currentTime
				);

				gain.gain.value = 0; // Disable volume
				analyser.fftSize = 2048;
				oscillator.type = SIGNAL_TYPE; // Set oscillator to output triangle wave
				//oscillator.frequency.setValueAtTime(freqVal.frequencyValueAtTimeFormControl, audioCtx.currentTime);
				oscillator.connect(compressor); // Connect oscillator output to dynamic compressor
				compressor.connect(analyser); // Connect compressor to analyser
				analyser.connect(scriptProcessor); // Connect analyser output to scriptProcessor input
				scriptProcessor.connect(gain); // Connect scriptProcessor output to gain input
				gain.connect(audioCtx.destination); // Connect gain output to audiocontext destination
				scriptProcessor.onaudioprocess = async (bins: any) => {
					bins = new Float32Array(analyser.frequencyBinCount);
					analyser.getFloatFrequencyData(bins);
					for (let i = 0; i < bins.length; i++) {
						hybridOscillatorNode.push(bins[i]);
					}
					analyser.disconnect();
					scriptProcessor.disconnect();
					gain.disconnect();
					const audioFP = JSON.stringify(hybridOscillatorNode);
					hybridHash = CryptoJS.MD5(audioFP).toString();
					// console.log({"hybridAudioCtx": hybridHash, "values": hybridOscillatorNode})
					await audioCtx.close();
					resolve({
						hash: hybridHash,
						values: hybridOscillatorNode,
						noFingerprint: false,
					});
				};
				oscillator.start(0);
			} else {
				reject({
					hash: hybridHash,
					values: hybridOscillatorNode,
					noFingerprint: true,
				});
			}
		} catch (u) {
			reject({
				hash: hybridHash,
				values: hybridOscillatorNode,
				noFingerprint: true,
			});
		}
	});
}

function getCustomSignalHybridFingerprintAudioCtx() {
	let hybridOscillatorNode = [];
	let hybridHash = "";
	return new Promise(async (resolve, reject) => {
		try {
			let audioCtx = new ((<any>window).AudioContext ||
				(<any>window).webkitAudioContext)();
			if (audioCtx) {
				const OFFSET = 0.7;
				const pi = Math.PI;
				// https://medium.com/web-audio/phase-offsets-with-web-audio-wavetables-c7dc85ac3218
				// https://meettechniek.info/additional/additive-synthesis.html
				const real = new Float32Array(11);
				const imag = new Float32Array(11);
				real[0] = 0.36;
				real[1] = 0.76;
				real[2] = 0.12;
				real[3] = 0.745;
				real[4] = 0.235;
				real[5] = 0.145;
				real[6] = 0.545;
				real[7] = 0.675;
				real[8] = 0.585;
				real[9] = 0.685;
				real[10] = 0.115;
				real[11] = 0.66;

				imag[0] = pi / 2;
				imag[1] = 0;
				imag[2] = pi / 2;
				imag[3] = 0;
				imag[4] = pi / 2;
				imag[5] = 0;
				imag[6] = pi / 2;
				imag[7] = 0;
				imag[8] = pi / 2;
				imag[9] = 0;
				imag[10] = pi / 2;
				imag[11] = 0;

				const wave = audioCtx.createPeriodicWave(real, imag, {
					disableNormalization: true,
				});
				let oscillator = audioCtx.createOscillator();
				oscillator.frequency.value = 440;
				oscillator.setPeriodicWave(wave);
				const offset = audioCtx.createConstantSource();
				offset.offset.value = OFFSET;
				let analyser = audioCtx.createAnalyser();
				let gain = audioCtx.createGain();
				let scriptProcessor = audioCtx.createScriptProcessor(
					SCRIPT_PROCESSOR.bufferSize,
					SCRIPT_PROCESSOR.numberOfInputChannels,
					SCRIPT_PROCESSOR.numberOfOutputChannels
				);

				let compressor = audioCtx.createDynamicsCompressor();
				compressor.threshold.setValueAtTime(
					COMPRESSOR.threshold,
					audioCtx.currentTime
				);
				compressor.knee.setValueAtTime(COMPRESSOR.knee, audioCtx.currentTime);
				compressor.ratio.setValueAtTime(COMPRESSOR.ratio, audioCtx.currentTime);
				compressor.attack.setValueAtTime(
					COMPRESSOR.attack,
					audioCtx.currentTime
				);
				compressor.release.setValueAtTime(
					COMPRESSOR.release,
					audioCtx.currentTime
				);

				gain.gain.value = 0; // Disable volume
				analyser.fftSize = 2048;
				oscillator.connect(compressor); // Connect oscillator output to dynamic compressor
				compressor.connect(analyser); // Connect oscillator output to dynamic compressor
				analyser.connect(scriptProcessor); // Connect analyser output to scriptProcessor input
				scriptProcessor.connect(gain); // Connect scriptProcessor output to gain input
				gain.connect(audioCtx.destination); // Connect gain output to audiocontext destination

				scriptProcessor.onaudioprocess = async (bins: any) => {
					bins = new Float32Array(analyser.frequencyBinCount);
					analyser.getFloatFrequencyData(bins);
					for (let i = 0; i < bins.length; i++) {
						hybridOscillatorNode.push(bins[i]);
					}
					analyser.disconnect();
					scriptProcessor.disconnect();
					gain.disconnect();
					const audioFP = JSON.stringify(hybridOscillatorNode);
					hybridHash = CryptoJS.MD5(audioFP).toString();
					await audioCtx.close();
					// console.log({"customWaveHybrid": hybridHash, "values": hybridOscillatorNode});
					resolve({
						hash: hybridHash,
						values: hybridOscillatorNode,
						noFingerprint: false,
					});
				};
				oscillator.start(0);
				offset.start();
			} else {
				reject({
					hash: hybridHash,
					values: hybridOscillatorNode,
					noFingerprint: true,
				});
			}
		} catch (u) {
			reject({
				hash: hybridHash,
				values: hybridOscillatorNode,
				noFingerprint: true,
			});
		}
	});
}

function getAudioSourceHybridFingeprintAudioCtx() {
	let audioData = null;
	let hash = "";
	let analyserNodeData = [];
	return new Promise((resolve, reject) => {
		try {
			const audioContext = new ((<any>window).AudioContext ||
				(<any>window).webkitAudioContext)();
			if (audioContext) {
				const sourceNode = audioContext.createBufferSource();
				const analyserNode = audioContext.createAnalyser();
				const gain = audioContext.createGain();
				const scriptProcessor = audioContext.createScriptProcessor(
					SCRIPT_PROCESSOR.bufferSize,
					SCRIPT_PROCESSOR.numberOfInputChannels,
					SCRIPT_PROCESSOR.numberOfOutputChannels
				);
				// Create and configure compressor
				const compressor = audioContext.createDynamicsCompressor();
				compressor.threshold.setValueAtTime(
					COMPRESSOR.threshold,
					audioContext.currentTime
				);
				compressor.knee.setValueAtTime(
					COMPRESSOR.knee,
					audioContext.currentTime
				);
				compressor.ratio.setValueAtTime(
					COMPRESSOR.ratio,
					audioContext.currentTime
				);
				compressor.attack.setValueAtTime(
					COMPRESSOR.attack,
					audioContext.currentTime
				);
				compressor.release.setValueAtTime(
					COMPRESSOR.release,
					audioContext.currentTime
				);
				gain.gain.value = 0; // Disable volume
				analyserNode.fftSize = 2048;

				// Now connect the nodes together
				sourceNode.connect(compressor);
				compressor.connect(analyserNode);
				analyserNode.connect(scriptProcessor);
				scriptProcessor.connect(gain);
				gain.connect(audioContext.destination);

				scriptProcessor.onaudioprocess = async (event: any) => {
					const bins = new Float32Array(analyserNode.frequencyBinCount);
					analyserNode.getFloatFrequencyData(bins);
					for (let i = 0; i < bins.length; i++) {
						analyserNodeData.push(bins[i]);
					}
					const audioFP = JSON.stringify(analyserNodeData);
					hash = CryptoJS.MD5(audioFP).toString();
					gain.disconnect();
					scriptProcessor.disconnect();
					analyserNode.disconnect();
					await audioContext.close();
					//console.log({"audioSourceHybrid": hash, "values": analyserNodeData})
					resolve({
						hash: hash,
						values: analyserNodeData,
						noFingerprint: false,
					});
				};
				// Load the Audio the first time through, otherwise play it from the buffer
				if (audioData == null) {
					const request = new XMLHttpRequest();
					request.open("GET", "../../../assets/viper-05.ogg", true);
					request.responseType = "arraybuffer";
					request.onload = () => {
						audioContext.decodeAudioData(
							request.response,
							function (buffer) {
								audioData = buffer;
								sourceNode.buffer = buffer;
								sourceNode.start(0); // Play the sound now
								sourceNode.loop = false;
							},
							function (e) {
								"Error with decoding audio data" + e;
							}
						);
					};
					request.send();
				} else {
					sourceNode.buffer = audioData;
					sourceNode.start(0); // Play the sound now
					sourceNode.loop = false;
				}
			} else {
				reject({ hash: hash, values: analyserNodeData, noFingerprint: true });
			}
		} catch (u) {
			reject({ hash: hash, values: analyserNodeData, noFingerprint: true });
		}
	});
}

function getChannelMergeHybridFingerprintAudioCtx() {
	let hybridHash = "";
	let hybridOscillatorNode = [];
	return new Promise((resolve, reject) => {
		try {
			let audioCtx = new ((<any>window).AudioContext ||
				(<any>window).webkitAudioContext)();
			if (audioCtx) {
				let oscillator1 = audioCtx.createOscillator();
				oscillator1.type = "sine";
				oscillator1.frequency.setValueAtTime(440, audioCtx.currentTime);
				let oscillator2 = audioCtx.createOscillator();
				oscillator2.type = "triangle";
				oscillator2.frequency.setValueAtTime(10000, audioCtx.currentTime);
				let oscillator3 = audioCtx.createOscillator();
				oscillator3.type = "square";
				oscillator3.frequency.setValueAtTime(1880, audioCtx.currentTime);
				let oscillator4 = audioCtx.createOscillator();
				oscillator4.type = "sawtooth";
				oscillator4.frequency.setValueAtTime(22000, audioCtx.currentTime);

				let channelMerger = audioCtx.createChannelMerger(4);
				oscillator1.connect(channelMerger, 0, 0);
				oscillator2.connect(channelMerger, 0, 1);
				oscillator3.connect(channelMerger, 0, 2);
				oscillator4.connect(channelMerger, 0, 3);

				let compressor = audioCtx.createDynamicsCompressor();
				let analyser = audioCtx.createAnalyser();
				let gain = audioCtx.createGain();
				let scriptProcessor = audioCtx.createScriptProcessor(
					SCRIPT_PROCESSOR.bufferSize,
					SCRIPT_PROCESSOR.numberOfInputChannels,
					SCRIPT_PROCESSOR.numberOfOutputChannels
				);

				compressor.threshold.setValueAtTime(
					COMPRESSOR.threshold,
					audioCtx.currentTime
				);
				compressor.knee.setValueAtTime(COMPRESSOR.knee, audioCtx.currentTime);
				compressor.ratio.setValueAtTime(COMPRESSOR.ratio, audioCtx.currentTime);
				compressor.attack.setValueAtTime(
					COMPRESSOR.attack,
					audioCtx.currentTime
				);
				compressor.release.setValueAtTime(
					COMPRESSOR.release,
					audioCtx.currentTime
				);

				gain.gain.value = 0; // Disable volume
				analyser.fftSize = 4096;

				channelMerger.connect(compressor); // Connect merger to compressor
				compressor.connect(analyser); // Connect compressor to analyser
				analyser.connect(scriptProcessor); // Connect analyser output to scriptProcessor input
				scriptProcessor.connect(gain); // Connect scriptProcessor output to gain input
				gain.connect(audioCtx.destination); // Connect gain output to audiocontext destination

				scriptProcessor.onaudioprocess = async (bins: any) => {
					bins = new Float32Array(analyser.frequencyBinCount);
					analyser.getFloatFrequencyData(bins);
					for (let i = 0; i < bins.length; i++) {
						hybridOscillatorNode.push(bins[i]);
					}
					analyser.disconnect();
					scriptProcessor.disconnect();
					gain.disconnect();
					const audioFP = JSON.stringify(hybridOscillatorNode);
					hybridHash = CryptoJS.MD5(audioFP).toString();
					await audioCtx.close();
					// console.log({"channelMergeHybrid": hybridHash, "values": hybridOscillatorNode});
					resolve({
						hash: hybridHash,
						values: hybridOscillatorNode,
						noFingerprint: false,
					});
				};
				//start source
				oscillator1.start(0);
				oscillator2.start(0);
				oscillator3.start(0);
				oscillator4.start(0);
			} else {
				reject({
					hash: hybridHash,
					values: hybridOscillatorNode,
					noFingerprint: true,
				});
			}
		} catch (u) {
			reject({
				hash: hybridHash,
				values: hybridOscillatorNode,
				noFingerprint: true,
			});
		}
	});
}

function getAmplitudeModulationHybridFingerprintAudioCtx() {
	let hybridOscillatorNode = [];
	let hybridHash = "";
	return new Promise((resolve, reject) => {
		try {
			let audioCtx = new ((<any>window).AudioContext ||
				(<any>window).webkitAudioContext)();
			if (audioCtx) {
				let mod = audioCtx.createOscillator();
				mod.frequency.setValueAtTime(18, audioCtx.currentTime);
				mod.type = "square";

				let modGain = audioCtx.createGain();
				modGain.gain.value = 30;

				let mod1 = audioCtx.createOscillator();
				mod1.frequency.setValueAtTime(440, audioCtx.currentTime);
				mod1.type = "triangle";

				let modGain1 = audioCtx.createGain();
				modGain1.gain.value = 60;

				let carrier = audioCtx.createOscillator();
				carrier.type = "sine";
				carrier.frequency.setValueAtTime(10000, audioCtx.currentTime);

				let carrierGain = audioCtx.createGain();
				carrierGain.gain.value = 1;

				let analyser = audioCtx.createAnalyser();
				let masterGain = audioCtx.createGain();
				masterGain.gain.value = 0; // Disable volume
				let scriptProcessor = audioCtx.createScriptProcessor(
					SCRIPT_PROCESSOR.bufferSize,
					SCRIPT_PROCESSOR.numberOfInputChannels,
					SCRIPT_PROCESSOR.numberOfOutputChannels
				);

				mod.connect(modGain);
				mod1.connect(modGain1);
				mod.connect(carrierGain.gain);
				mod1.connect(carrierGain.gain);
				carrier.connect(carrierGain);
				// Create and configure compressor
				let compressor = audioCtx.createDynamicsCompressor();
				compressor.threshold.setValueAtTime(
					COMPRESSOR.threshold,
					audioCtx.currentTime
				);
				compressor.knee.setValueAtTime(COMPRESSOR.knee, audioCtx.currentTime);
				compressor.ratio.setValueAtTime(COMPRESSOR.ratio, audioCtx.currentTime);
				compressor.attack.setValueAtTime(
					COMPRESSOR.attack,
					audioCtx.currentTime
				);
				compressor.release.setValueAtTime(
					COMPRESSOR.release,
					audioCtx.currentTime
				);

				analyser.fftSize = 4096;

				carrierGain.connect(compressor); // Connect carrier oscillator output to dynamic compressor
				compressor.connect(analyser); // Connect compressor to analyser
				analyser.connect(scriptProcessor); // Connect analyser output to scriptProcessor input
				scriptProcessor.connect(masterGain); // Connect scriptProcessor output to gain input
				masterGain.connect(audioCtx.destination); // Connect gain output to audiocontext destination

				scriptProcessor.onaudioprocess = async (bins: any) => {
					bins = new Float32Array(analyser.frequencyBinCount);
					analyser.getFloatFrequencyData(bins);

					// bins = new Uint8Array(analyser.frequencyBinCount);
					// analyser.getByteFrequencyData(bins);

					for (let i = 0; i < bins.length; i++) {
						hybridOscillatorNode.push(bins[i]);
					}

					analyser.disconnect();
					scriptProcessor.disconnect();
					masterGain.disconnect();
					const audioFP = JSON.stringify(hybridOscillatorNode);

					hybridHash = CryptoJS.MD5(audioFP).toString();
					await audioCtx.close();

					resolve({
						hash: hybridHash,
						values: hybridOscillatorNode,
						noFingerprint: false,
					});
				};
				carrier.start(0);
				mod.start(0);
				mod1.start(0);
			} else {
				reject({
					hash: hybridHash,
					values: hybridOscillatorNode,
					noFingerprint: true,
				});
			}
		} catch (u) {
			reject({
				hash: hybridHash,
				values: hybridOscillatorNode,
				noFingerprint: true,
			});
		}
	});
}

function getFrequencyModulationHybridFingerprintAudioCtx() {
	let hybridOscillatorNode = [];
	let hybridHash = "";
	return new Promise((resolve, reject) => {
		try {
			let audioCtx = new ((<any>window).AudioContext ||
				(<any>window).webkitAudioContext)();
			if (audioCtx) {
				let mod = audioCtx.createOscillator();
				mod.frequency.setValueAtTime(18, audioCtx.currentTime);
				mod.type = "square";

				let modGain = audioCtx.createGain();
				modGain.gain.value = 30;

				let mod1 = audioCtx.createOscillator();
				mod1.frequency.setValueAtTime(440, audioCtx.currentTime);
				mod1.type = "triangle";

				let modGain1 = audioCtx.createGain();
				modGain1.gain.value = 60;

				let carrier = audioCtx.createOscillator();
				carrier.type = "sine";
				carrier.frequency.setValueAtTime(10000, audioCtx.currentTime);

				let carrierGain = audioCtx.createGain();
				carrierGain.gain.value = 1;

				let analyser = audioCtx.createAnalyser();
				let masterGain = audioCtx.createGain();
				masterGain.gain.value = 0; // Disable volume
				let scriptProcessor = audioCtx.createScriptProcessor(
					SCRIPT_PROCESSOR.bufferSize,
					SCRIPT_PROCESSOR.numberOfInputChannels,
					SCRIPT_PROCESSOR.numberOfOutputChannels
				);

				mod.connect(modGain);
				modGain.connect(carrier.frequency);

				mod1.connect(modGain1);
				modGain1.connect(carrier.frequency);

				// Create and configure compressor
				let compressor = audioCtx.createDynamicsCompressor();
				compressor.threshold.setValueAtTime(
					COMPRESSOR.threshold,
					audioCtx.currentTime
				);
				compressor.knee.setValueAtTime(COMPRESSOR.knee, audioCtx.currentTime);
				compressor.ratio.setValueAtTime(COMPRESSOR.ratio, audioCtx.currentTime);
				compressor.attack.setValueAtTime(
					COMPRESSOR.attack,
					audioCtx.currentTime
				);
				compressor.release.setValueAtTime(
					COMPRESSOR.release,
					audioCtx.currentTime
				);

				carrier.connect(compressor); // Connect carrier output to analyser input
				compressor.connect(analyser); // Connect compressor to analyser
				analyser.connect(scriptProcessor); // Connect analyser output to scriptProcessor input
				scriptProcessor.connect(masterGain); // Connect scriptProcessor output to gain input
				masterGain.connect(audioCtx.destination); // Connect gain output to audiocontext destination

				scriptProcessor.onaudioprocess = async (bins: any) => {
					bins = new Float32Array(analyser.frequencyBinCount);
					analyser.getFloatFrequencyData(bins);

					// bins = new Uint8Array(analyser.frequencyBinCount);
					// analyser.getByteFrequencyData(bins);

					for (let i = 0; i < bins.length; i++) {
						hybridOscillatorNode.push(bins[i]);
					}
					analyser.disconnect();
					scriptProcessor.disconnect();
					masterGain.disconnect();
					const audioFP = JSON.stringify(hybridOscillatorNode);
					hybridHash = CryptoJS.MD5(audioFP).toString();

					await audioCtx.close();
					// console.log({"frequencyModuationHybdrid": hybridHash, "values": hybridOscillatorNode})
					resolve({
						hash: hybridHash,
						values: hybridOscillatorNode,
						noFingerprint: false,
					});
				};
				carrier.start(0);
				mod.start(0);
				mod1.start(0);
			} else {
				reject({
					hash: hybridHash,
					values: hybridOscillatorNode,
					noFingerprint: true,
				});
			}
		} catch (u) {
			reject({
				hash: hybridHash,
				values: hybridOscillatorNode,
				noFingerprint: true,
			});
		}
	});
}

function getMathJS_FP() {
	let math_js_hash = null;
	let math_js_value = [];
	return new Promise((resolve, reject) => {
		try {
			const M = Math;

			// Mathjs from FingerprintJs2
			// Operation polyfills
			const powPI = (value: number) => M.pow(M.PI, value);
			math_js_value.push(powPI(3847));

			const acoshPf = (value: number) =>
				M.log(value + M.sqrt(value * value - 1));

			const asinhPf = (value: number) =>
				M.log(value + M.sqrt(value * value + 1));

			const atanhPf = (value: number) => M.log((1 + value) / (1 - value)) / 2;

			const sinhPf = (value: number) => M.exp(value) - 1 / M.exp(value) / 2;

			const coshPf = (value: number) => (M.exp(value) + 1 / M.exp(value)) / 2;

			const expm1Pf = (value: number) => M.exp(value) - 1;

			const tanhPf = (value: number) =>
				(M.exp(2 * value) - 1) / (M.exp(2 * value) + 1);

			const log1pPf = (value: number) => M.log(1 + value);

			math_js_value.push(Math.acos(0.123124234234234242));

			math_js_value.push(Math.acosh(1e308));

			math_js_value.push(acoshPf(1e154));

			math_js_value.push(Math.asin(0.123124234234234242));

			math_js_value.push(Math.asinh(1));

			math_js_value.push(asinhPf(1));

			math_js_value.push(Math.atanh(0.5));

			math_js_value.push(atanhPf(0.5));
			math_js_value.push(Math.atan(0.5));

			math_js_value.push(Math.sin(-1e300));
			math_js_value.push(Math.sinh(1));
			math_js_value.push(sinhPf(1));
			math_js_value.push(Math.cos(10.000000000123));
			math_js_value.push(Math.cosh(1));
			math_js_value.push(coshPf(1));
			math_js_value.push(Math.tan(-1e300));
			math_js_value.push(Math.tanh(1));
			math_js_value.push(tanhPf(1));
			math_js_value.push(Math.exp(1));
			math_js_value.push(Math.expm1(1));
			math_js_value.push(expm1Pf(1));
			math_js_value.push(Math.log1p(10));
			math_js_value.push(log1pPf(10));
			math_js_value.push(powPI(-100));

			// Mathjs from Firefox Mozilla's code
			// POLYFILLS
			const acosh = (x: number) => Math.log(x + Math.sqrt(x * x - 1));
			const asinh = (x: number) => {
				const absX = Math.abs(x);
				if (absX < Math.pow(2, -28)) {
					return x;
				}
				const w =
					absX > Math.pow(2, 28)
						? Math.log(absX) + Math.LN2
						: absX > 2
						? Math.log(2 * absX + 1 / Math.sqrt(x * x + 1))
						: Math.log1p(absX + (x * x) / (1 + Math.sqrt(1 + x * x)));
				return x > 0 ? w : -w;
			};
			const atanh = (x: number) => Math.log((1 + x) / (1 - x)) / 2;
			function cbrt(x: number) {
				let y = Math.pow(Math.abs(x), 1 / 3);
				return x < 0 ? -y : y;
			}
			const cosh = (x: number) => (Math.exp(x) + Math.exp(-x)) / 2;
			const expm1 = (x: number) => Math.exp(x) - 1;
			function hypot(array: string | any[]) {
				let i: number,
					s = 0,
					max = 0,
					isInfinity = false,
					len = array.length;
				for (i = 0; i < len; ++i) {
					const arg = Math.abs(+array[i]);
					if (arg === Infinity) {
						isInfinity = true;
					}
					if (arg > max) {
						s *= (max / arg) * (max / arg);
						max = arg;
					}
					s += arg === 0 && max === 0 ? 0 : (arg / max) * (arg / max);
				}
				return isInfinity
					? Infinity
					: max === Infinity
					? Infinity
					: max * Math.sqrt(s);
			}
			const log1p = (x: number) => {
				const nearX = x + 1 - 1;
				return x < -1 || x !== x
					? NaN
					: x === 0 || x === Infinity
					? x
					: nearX === 0
					? x
					: x * (Math.log(x + 1) / nearX);
			};
			const log2 = (x: number) => Math.log(x) * Math.LOG2E;
			const log10 = (x: number) => Math.log(x) * Math.LOG10E;
			const sinh = (x: number) => (Math.exp(x) - Math.exp(-x)) / 2;
			const tanh = (x: number) => {
				const a = Math.exp(+x);
				const b = Math.exp(-x);
				return a == Infinity ? 1 : b == Infinity ? -1 : (a - b) / (a + b);
			};

			const n = 10;
			math_js_value.push(Math.acos(n));
			math_js_value.push(Math.acos(Math.SQRT1_2));

			math_js_value.push(acosh(1e308));
			math_js_value.push(acosh(Math.PI));
			math_js_value.push(acosh(Math.SQRT2));

			math_js_value.push(Math.asin(n));

			math_js_value.push(asinh(1e300));
			math_js_value.push(asinh(Math.PI));

			math_js_value.push(Math.atan(2));
			math_js_value.push(Math.atan(Math.PI));
			math_js_value.push(atanh(0.5));

			math_js_value.push(Math.cbrt(100));
			math_js_value.push(cbrt(Math.PI));

			// original TZP cos
			math_js_value.push(Math.cos(1e251));
			math_js_value.push(Math.cos(1e140));
			math_js_value.push(Math.cos(1e12));
			math_js_value.push(Math.cos(1e130));
			math_js_value.push(Math.cos(1e272));
			math_js_value.push(Math.cos(1));
			math_js_value.push(Math.cos(1e284));
			math_js_value.push(Math.cos(1e75));

			math_js_value.push(Math.cos(n));
			math_js_value.push(Math.cos(Math.PI));
			math_js_value.push(Math.cos(13 * Math.E));

			math_js_value.push(Math.cos(57 * Math.E));
			math_js_value.push(Math.cos(21 * Math.LN2));
			math_js_value.push(Math.cos(51 * Math.LN2));
			math_js_value.push(Math.cos(21 * Math.LOG2E));
			math_js_value.push(Math.cos(25 * Math.SQRT2));
			math_js_value.push(Math.cos(50 * Math.SQRT1_2));
			math_js_value.push(Math.cos(21 * Math.SQRT1_2));
			math_js_value.push(Math.cos(17 * Math.LOG10E));
			math_js_value.push(Math.cos(2 * Math.LOG10E));

			math_js_value.push(cosh(1));
			math_js_value.push(cosh(Math.PI));
			math_js_value.push(cosh(492 * Math.LOG2E));
			math_js_value.push(cosh(502 * Math.SQRT2));

			math_js_value.push(expm1(1));
			math_js_value.push(expm1(Math.PI));

			math_js_value.push(Math.exp(n));
			math_js_value.push(Math.exp(Math.PI));

			math_js_value.push(hypot([1, 2, 3, 4, 5, 6]));

			math_js_value.push(hypot([2 * Math.E, -100]));

			math_js_value.push(hypot([6 * Math.PI, -100]));
			math_js_value.push(hypot([Math.LOG2E, -100]));
			math_js_value.push(hypot([Math.SQRT2, -100]));
			math_js_value.push(hypot([Math.SQRT1_2, -100]));
			math_js_value.push(hypot([2 * Math.LOG10E, -100]));

			math_js_value.push(Math.log(n));
			math_js_value.push(Math.log(Math.PI));

			math_js_value.push(log1p(n));
			math_js_value.push(log1p(Math.PI));

			math_js_value.push(log10(n));
			math_js_value.push(log10(Math.PI));
			math_js_value.push(log10(Math.E));
			math_js_value.push(log10(34 * Math.E));
			math_js_value.push(log10(Math.LN2));
			math_js_value.push(log10(11 * Math.LN2));
			math_js_value.push(log10(Math.LOG2E));
			math_js_value.push(log10(43 * Math.LOG2E));
			math_js_value.push(log10(Math.LOG10E));
			math_js_value.push(log10(7 * Math.LOG10E));
			math_js_value.push(log10(Math.SQRT1_2));
			math_js_value.push(log10(2 * Math.SQRT1_2));
			math_js_value.push(log10(Math.SQRT2));

			math_js_value.push(Math.sin(1e251));
			math_js_value.push(Math.sin(1e140));
			math_js_value.push(Math.sin(1e12));
			math_js_value.push(Math.sin(1e130));
			math_js_value.push(Math.sin(1e272));
			math_js_value.push(Math.sin(1));
			math_js_value.push(Math.sin(1e284));
			math_js_value.push(Math.sin(1e75));

			math_js_value.push(Math.sin(Math.PI));
			math_js_value.push(Math.sin(39 * Math.E));
			math_js_value.push(Math.sin(35 * Math.LN2));
			math_js_value.push(Math.sin(110 * Math.LOG2E));
			math_js_value.push(Math.sin(7 * Math.LOG10E));
			math_js_value.push(Math.sin(35 * Math.SQRT1_2));
			math_js_value.push(Math.sin(21 * Math.SQRT2));

			math_js_value.push(sinh(1));
			math_js_value.push(sinh(Math.PI));
			math_js_value.push(sinh(Math.E));
			math_js_value.push(sinh(Math.LN2));
			math_js_value.push(sinh(Math.LOG2E));
			math_js_value.push(sinh(492 * Math.LOG2E));
			math_js_value.push(sinh(Math.LOG10E));
			math_js_value.push(sinh(Math.SQRT1_2));
			math_js_value.push(sinh(Math.SQRT2));
			math_js_value.push(sinh(502 * Math.SQRT2));

			math_js_value.push(Math.sqrt(n));
			math_js_value.push(Math.sqrt(Math.PI));

			// original TZP with tan

			math_js_value.push(Math.tan(1e251));
			math_js_value.push(Math.tan(1e140));
			math_js_value.push(Math.tan(1e12));
			math_js_value.push(Math.tan(1e130));
			math_js_value.push(Math.tan(1e272));
			math_js_value.push(Math.tan(1));
			math_js_value.push(Math.tan(1e284));
			math_js_value.push(Math.tan(1e75));
			math_js_value.push(Math.tan(-1e308));
			math_js_value.push(Math.tan(Math.PI));
			math_js_value.push(Math.tan(6 * Math.E));
			math_js_value.push(Math.tan(6 * Math.LN2));
			math_js_value.push(Math.tan(10 * Math.LOG2E));
			math_js_value.push(Math.tan(17 * Math.SQRT2));
			math_js_value.push(Math.tan(34 * Math.SQRT1_2));
			math_js_value.push(Math.tan(10 * Math.LOG10E));

			math_js_value.push(tanh(n));
			math_js_value.push(tanh(Math.PI));

			math_js_value.push(Math.pow(n, -100));
			math_js_value.push(Math.pow(Math.PI, -100));
			math_js_value.push(Math.pow(Math.E, -100));
			math_js_value.push(Math.pow(Math.LN2, -100));
			math_js_value.push(Math.pow(Math.LN10, -100));
			math_js_value.push(Math.pow(Math.LOG2E, -100));
			math_js_value.push(Math.pow(Math.LOG10E, -100));
			math_js_value.push(Math.pow(Math.SQRT1_2, -100));
			math_js_value.push(Math.pow(Math.SQRT2, -100));

			const MathJSFP = JSON.stringify(math_js_value);
			math_js_hash = CryptoJS.MD5(MathJSFP).toString();

			// console.log('Math js Hash: ' + math_js_hash);
			// console.log({
			//   'MathJs Hash': math_js_hash,
			//   values: math_js_value.join(),
			// });
			resolve({
				hash: math_js_hash,
				values: math_js_value,
				noFingerprint: false,
			});
		} catch (ex) {
			console.log("failed to get MathJs");
			reject({
				hash: math_js_hash,
				values: math_js_value,
				noFingerprint: true,
			});
		}
	});
}
