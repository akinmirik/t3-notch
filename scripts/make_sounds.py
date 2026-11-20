"""Small original synthesized notification sounds. No external sound assets."""
import math
import pathlib
import struct
import sys
import wave

def create(folder):
    rate = 22050
    for name, base, decay in [('Glass', 880, 7), ('Wood', 520, 15), ('Air', 660, 5)]:
        for state, notes in [('done', [(0, 1), (.12, 1.5)]),
                             ('wait', [(0, 1), (.22, 1.25)]),
                             ('error', [(0, 1), (.18, .8)])]:
            values = []
            for i in range(int(rate * .85)):
                sec = i / rate
                value = 0
                for start, ratio in notes:
                    t = sec - start
                    if t < 0:
                        continue
                    envelope = min(1, t / .015) * math.exp(-decay * t) * min(1, (.85-sec)/.08)
                    value += .23 * envelope * (math.sin(2*math.pi*base*ratio*t) + .15*math.sin(2*math.pi*base*ratio*2*t))
                values.append(struct.pack('<h', int(max(-1, min(1, value)) * 32767)))
            with wave.open(str(pathlib.Path(folder) / f'{name}-{state}.wav'), 'wb') as f:
                f.setparams((1, 2, rate, 0, 'NONE', 'not compressed')); f.writeframes(b''.join(values))

if __name__ == '__main__':
    create(sys.argv[1])
