#!/bin/bash
# BGM: -27dB / 効果音: -15dB でマスタリング。ffmpeg が必要です。
# 使い方: chmod +x scripts/adjust-audio-levels.sh && ./scripts/adjust-audio-levels.sh
# または: brew install ffmpeg のあとこのスクリプトを実行

set -e
cd "$(dirname "$0")/.."
AUDIO=audio

echo "BGM を -27dB で調整..."
ffmpeg -i "$AUDIO/bgm_normal.mp3" -filter:a "volume=-27dB" -y "$AUDIO/bgm_normal_tmp.mp3" && mv "$AUDIO/bgm_normal_tmp.mp3" "$AUDIO/bgm_normal.mp3"
ffmpeg -i "$AUDIO/bgm_danger.mp3" -filter:a "volume=-27dB" -y "$AUDIO/bgm_danger_tmp.mp3" && mv "$AUDIO/bgm_danger_tmp.mp3" "$AUDIO/bgm_danger.mp3"

echo "効果音を -15dB で調整..."
ffmpeg -i "$AUDIO/play.mp3" -filter:a "volume=-15dB" -y "$AUDIO/play_tmp.mp3" && mv "$AUDIO/play_tmp.mp3" "$AUDIO/play.mp3"
ffmpeg -i "$AUDIO/little_cure.mp3" -filter:a "volume=-15dB" -y "$AUDIO/little_cure_tmp.mp3" && mv "$AUDIO/little_cure_tmp.mp3" "$AUDIO/little_cure.mp3"
ffmpeg -i "$AUDIO/iwa_gameover010.mp3" -filter:a "volume=-15dB" -y "$AUDIO/iwa_gameover010_tmp.mp3" && mv "$AUDIO/iwa_gameover010_tmp.mp3" "$AUDIO/iwa_gameover010.mp3"

echo "完了しました。"
