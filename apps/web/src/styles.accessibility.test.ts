import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

function declaredHexColor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));
  const declarations = rule?.[1];
  const color = declarations?.match(/(?:^|;)\s*color:\s*(#[\da-f]{6})\s*;/i)?.[1];

  if (!color) throw new Error(`No six-digit color declaration found for ${selector}`);
  return color;
}

function relativeLuminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('dashboard text contrast', () => {
  it.each([
    ['.attention-list article div span', '#fffefa'],
    ['.next-action-grid p', '#f5f4ef'],
  ])('%s meets WCAG AA against its rendered background', (selector, background) => {
    expect(contrastRatio(declaredHexColor(selector), background)).toBeGreaterThanOrEqual(4.5);
  });
});
