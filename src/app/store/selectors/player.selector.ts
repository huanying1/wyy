import {PlayState} from '../reducers/player.reducer';
import {createFeatureSelector, createSelector} from '@ngrx/store';

const featureKey = 'player';
export const selectPlayer = createFeatureSelector<PlayState>(featureKey);

const selectPlayerStates = (state:PlayState) => state;

export const getPlayList = createSelector(selectPlayerStates,(state:PlayState) => state.playList);
export const getSongList = createSelector(selectPlayerStates,(state:PlayState) => state.songList);
export const getPlayMode = createSelector(selectPlayerStates,(state:PlayState) => state.playMode);
export const getCurrentIndex = createSelector(selectPlayerStates,(state:PlayState) => state.currentIndex);
export const getCurrentAction = createSelector(selectPlayerStates,(state:PlayState) => state.currentAction);

export const getCurrentSong = createSelector(selectPlayerStates,({playList,currentIndex}:PlayState) => playList[currentIndex]);
