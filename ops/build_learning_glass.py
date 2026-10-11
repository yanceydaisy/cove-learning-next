#!/usr/bin/env python3
"""Rebuild the default Learning Liquid Glass UI from approved Home V5 optics.

Uses the real V5 shader, not a CSS imitation. The Learning application
and APIs remain identical; ?ui=classic is a recovery-only appearance fallback.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
HOME=Path('/home/ubuntu/projects/cove-home-liquid/home-liquid-v5.js')
APP=ROOT/'public/app.js'
STYLE=ROOT/'public/style.css'
RUNTIME=ROOT/'ops/learning-glass-runtime.js'
CSS=ROOT/'ops/learning-glass-ui.css'
JS_START='\n/* BEGIN OPT-IN LEARNING LIQUID GLASS UI */\n'
JS_END='\n/* END OPT-IN LEARNING LIQUID GLASS UI */\n'
CSS_START='\n/* BEGIN OPT-IN LEARNING LIQUID GLASS UI */\n'
CSS_END='\n/* END OPT-IN LEARNING LIQUID GLASS UI */\n'

def replace_or_append(path,body,start,end):
    original=path.read_text()
    if start in original:
        assert original.count(start)==1 and original.count(end)==1
        before,tail=original.split(start,1)
        _,after=tail.split(end,1)
        result=before+start+body+end+after
    else:
        assert end not in original
        result=original.rstrip()+start+body+end
    path.write_text(result)

def main():
    home=HOME.read_text()
    a=home.index('  const vertex = `')
    b=home.index('  function drawBackdrop(',a)
    shader=home[a:b].rstrip()
    assert 'float interiorStrength=(0.052+0.12*edgeGain)' in shader
    assert 'float hairline=exp(' in shader
    assert 'vec3 gaussianBackdrop(' in shader
    template=RUNTIME.read_text()
    assert template.count('/*__GLASS_SHADER__*/')==1
    script=template.replace('/*__GLASS_SHADER__*/',shader)
    css=CSS.read_text()
    replace_or_append(APP,script,JS_START,JS_END)
    replace_or_append(STYLE,css,CSS_START,CSS_END)
    print('Learning V5 is now the default UI at / (classic fallback: /?ui=classic).')
    print('Home V5 shader copied exactly, including interior lens, glints, Gaussian.')

if __name__=='__main__':
    main()
