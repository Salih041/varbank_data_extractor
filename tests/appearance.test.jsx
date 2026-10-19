import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TEXT_SIZES, DEFAULT_SETTINGS } from '../src/shared/config.js';
import { normalize } from '../src/sidepanel/state/settings.js';
import { TextSizePicker, TextSizeStepper, useApplyTextSize } from '../src/sidepanel/settings/TextSize.jsx';

afterEach(() => cleanup());

describe('textSize ayarı', () => {
  it('varsayılan Default (13.5px) ve 5 hazır boyut', () => {
    expect(DEFAULT_SETTINGS.textSize).toBe('md');
    expect(TEXT_SIZES.map((t) => t.px)).toEqual([12, 13.5, 15, 16.5, 18]);
    expect(TEXT_SIZES.find((t) => t.id === 'md').label).toBe('Default');
  });

  it('geçersiz değerleri varsayılana çevirir', () => {
    expect(normalize({ textSize: 'huge' }).textSize).toBe('md');
    expect(normalize({ textSize: 42 }).textSize).toBe('md');
    expect(normalize({}).textSize).toBe('md');
    expect(normalize({ textSize: 'xl' }).textSize).toBe('xl');
  });
});

describe('TextSizeStepper (A− / A+)', () => {
  it('bir adım küçültür/büyütür', () => {
    const onChange = vi.fn();
    render(<TextSizeStepper value="md" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Increase text size'));
    fireEvent.click(screen.getByLabelText('Decrease text size'));
    expect(onChange.mock.calls).toEqual([['lg'], ['sm']]);
  });

  it('uçlarda ilgili düğmeyi devre dışı bırakır', () => {
    const { rerender } = render(<TextSizeStepper value="sm" onChange={() => {}} />);
    expect(screen.getByLabelText('Decrease text size').disabled).toBe(true);
    expect(screen.getByLabelText('Increase text size').disabled).toBe(false);
    rerender(<TextSizeStepper value="xxl" onChange={() => {}} />);
    expect(screen.getByLabelText('Increase text size').disabled).toBe(true);
  });
});

describe('TextSizePicker', () => {
  it('seçili boyutu işaretler ve seçimde onChange çağırır', () => {
    const onChange = vi.fn();
    render(<TextSizePicker value="md" onChange={onChange} />);
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(5);
    expect(screen.getByRole('radio', { name: /Default/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /XX-Large/ }));
    expect(onChange).toHaveBeenCalledWith('xxl');
  });
});

describe('useApplyTextSize', () => {
  function Probe({ id }) {
    useApplyTextSize(id);
    return null;
  }
  it('kök font boyutunu seçili ön ayara göre ayarlar', () => {
    const { rerender } = render(<Probe id="lg" />);
    expect(document.documentElement.style.fontSize).toBe('15px');
    rerender(<Probe id="bogus" />);
    expect(document.documentElement.style.fontSize).toBe('13.5px');
  });
});
