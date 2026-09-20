import {
  addMenuCategory,
  DEFAULT_MENU_CATEGORIES,
  mergeMenuCategories,
  remapItemCategory,
  removeMenuCategory,
  renameMenuCategory,
} from './menu-categories';

describe('menu categories', () => {
  it('merges saved order with names still used on dishes', () => {
    expect(
      mergeMenuCategories(['Drinks', 'Karahi'], ['Karahi', 'New']),
    ).toEqual(['Drinks', 'Karahi', 'New']);
  });

  it('falls back to dish names then the default list when nothing is saved', () => {
    expect(mergeMenuCategories(undefined, ['BBQ'])).toEqual([
      'BBQ',
      ...DEFAULT_MENU_CATEGORIES.filter((name) => name !== 'BBQ'),
    ]);
  });

  it('adds a unique trimmed name', () => {
    expect(addMenuCategory(['Karahi'], '  BBQ  ')).toEqual({
      ok: true,
      list: ['Karahi', 'BBQ'],
    });
  });

  it('rejects a blank or duplicate name', () => {
    expect(addMenuCategory(['Karahi'], '   ').ok).toBe(false);
    expect(addMenuCategory(['Karahi'], 'karahi').ok).toBe(false);
  });

  it('renames a category without changing the others', () => {
    expect(renameMenuCategory(['Karahi', 'BBQ'], 'Karahi', 'Handi')).toEqual({
      ok: true,
      list: ['Handi', 'BBQ'],
      from: 'Karahi',
      to: 'Handi',
    });
  });

  it('does not delete the last category', () => {
    expect(removeMenuCategory(['Karahi'], 'Karahi').ok).toBe(false);
  });

  it('removes a category from a longer list', () => {
    expect(removeMenuCategory(['Karahi', 'BBQ'], 'Karahi')).toEqual({
      ok: true,
      list: ['BBQ'],
    });
  });

  it('rewrites dishes when a category is renamed or deleted', () => {
    expect(remapItemCategory('Karahi', 'Karahi', 'Handi')).toBe('Handi');
    expect(remapItemCategory('BBQ', 'Karahi', 'Handi')).toBe('BBQ');
  });
});
