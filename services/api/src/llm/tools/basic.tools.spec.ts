import { basicTools } from './basic.tools';

describe('basicTools', () => {
  it('defines the expected requirement tools', () => {
    expect(basicTools.map((item) => item.name)).toEqual([
      'check_constraint_validity',
      'lookup_entity_definition',
    ]);
  });

  it('checks explicit constraint validity', async () => {
    const tool = basicTools.find((item) => item.name === 'check_constraint_validity');

    await expect(tool?.invoke({ constraint: 'password must be at least 8 characters' })).resolves.toContain(
      '"valid":true',
    );
  });

  it('looks up an entity definition', async () => {
    const tool = basicTools.find((item) => item.name === 'lookup_entity_definition');

    await expect(tool?.invoke({ entity: 'phone_number' })).resolves.toContain('user contact number');
  });
});
