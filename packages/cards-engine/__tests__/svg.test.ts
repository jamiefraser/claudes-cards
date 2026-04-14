import * as fs from 'fs';
import * as path from 'path';

const SVG_DIR = path.resolve(__dirname, '../svg/phase10');

function readSvg(filename: string): string {
  const filepath = path.join(SVG_DIR, filename);
  return fs.readFileSync(filepath, 'utf-8');
}

function svgExists(filename: string): boolean {
  return fs.existsSync(path.join(SVG_DIR, filename));
}

function isValidXml(content: string): boolean {
  // Basic XML validation: starts with <svg and ends with </svg>
  const trimmed = content.trim();
  return trimmed.startsWith('<svg') && trimmed.endsWith('</svg>');
}

function hasCorrectViewBox(content: string): boolean {
  return content.includes('viewBox="0 0 250 350"');
}

describe('Phase 10 SVG Files', () => {
  const colors = ['red', 'blue', 'green', 'yellow'] as const;

  describe('Number cards exist', () => {
    for (const color of colors) {
      for (let n = 1; n <= 12; n++) {
        it(`${color}-${n}.svg exists`, () => {
          expect(svgExists(`${color}-${n}.svg`)).toBe(true);
        });
      }
    }
  });

  describe('Wild cards exist', () => {
    for (let n = 1; n <= 8; n++) {
      it(`wild-${n}.svg exists`, () => {
        expect(svgExists(`wild-${n}.svg`)).toBe(true);
      });
    }
  });

  describe('Skip cards exist', () => {
    for (let n = 1; n <= 4; n++) {
      it(`skip-${n}.svg exists`, () => {
        expect(svgExists(`skip-${n}.svg`)).toBe(true);
      });
    }
  });

  it('back.svg exists', () => {
    expect(svgExists('back.svg')).toBe(true);
  });

  describe('SVG validity', () => {
    for (const color of colors) {
      for (let n = 1; n <= 12; n++) {
        it(`${color}-${n}.svg is valid SVG XML`, () => {
          const content = readSvg(`${color}-${n}.svg`);
          expect(isValidXml(content)).toBe(true);
        });

        it(`${color}-${n}.svg has correct viewBox 250×350`, () => {
          const content = readSvg(`${color}-${n}.svg`);
          expect(hasCorrectViewBox(content)).toBe(true);
        });
      }
    }

    for (let n = 1; n <= 8; n++) {
      it(`wild-${n}.svg is valid SVG XML`, () => {
        const content = readSvg(`wild-${n}.svg`);
        expect(isValidXml(content)).toBe(true);
      });

      it(`wild-${n}.svg has correct viewBox 250×350`, () => {
        const content = readSvg(`wild-${n}.svg`);
        expect(hasCorrectViewBox(content)).toBe(true);
      });
    }

    for (let n = 1; n <= 4; n++) {
      it(`skip-${n}.svg is valid SVG XML`, () => {
        const content = readSvg(`skip-${n}.svg`);
        expect(isValidXml(content)).toBe(true);
      });

      it(`skip-${n}.svg has correct viewBox 250×350`, () => {
        const content = readSvg(`skip-${n}.svg`);
        expect(hasCorrectViewBox(content)).toBe(true);
      });
    }

    it('back.svg is valid SVG XML', () => {
      const content = readSvg('back.svg');
      expect(isValidXml(content)).toBe(true);
    });

    it('back.svg has correct viewBox 250×350', () => {
      const content = readSvg('back.svg');
      expect(hasCorrectViewBox(content)).toBe(true);
    });
  });

  describe('SVG content correctness', () => {
    for (const color of colors) {
      for (let n = 1; n <= 12; n++) {
        it(`${color}-${n}.svg contains number ${n}`, () => {
          const content = readSvg(`${color}-${n}.svg`);
          expect(content).toContain(`>${n}<`);
        });
      }
    }

    for (let n = 1; n <= 8; n++) {
      it(`wild-${n}.svg contains "W"`, () => {
        const content = readSvg(`wild-${n}.svg`);
        expect(content).toContain('>W<');
      });
    }

    for (let n = 1; n <= 4; n++) {
      it(`skip-${n}.svg contains skip symbol ⊘`, () => {
        const content = readSvg(`skip-${n}.svg`);
        expect(content).toContain('⊘');
      });
    }
  });

  describe('Number cards have correct color symbols', () => {
    const colorSymbols: Record<string, string> = {
      red: '◆',
      blue: '●',
      green: '■',
      yellow: '▲',
    };

    for (const color of colors) {
      it(`${color} cards contain the correct symbol ${colorSymbols[color]}`, () => {
        const content = readSvg(`${color}-1.svg`);
        expect(content).toContain(colorSymbols[color]);
      });
    }
  });

  describe('Rounded corners', () => {
    it('number cards have rounded corners (rx="15")', () => {
      const content = readSvg('red-1.svg');
      expect(content).toContain('rx="15"');
    });

    it('wild cards have rounded corners (rx="15")', () => {
      const content = readSvg('wild-1.svg');
      expect(content).toContain('rx="15"');
    });

    it('skip cards have rounded corners (rx="15")', () => {
      const content = readSvg('skip-1.svg');
      expect(content).toContain('rx="15"');
    });
  });
});
