import { Bm25Index, tokenize } from '../../rag/retrieval/bm25';

describe('tokenize（中文 bigram 分词）', () => {
  it('连续中文按二字组切', () => {
    expect(tokenize('冷冻商品解冻')).toEqual(['冷冻', '冻商', '商品', '品解', '解冻']);
  });

  it('英文/数字连续段按整词切并小写', () => {
    expect(tokenize('退货 Policy 2024')).toEqual(['退货', 'policy', '2024']);
  });

  it('单个中文字保留单字', () => {
    expect(tokenize('单')).toEqual(['单']);
  });

  it('标点与空白作为分隔符', () => {
    expect(tokenize('退款，说明')).toEqual(['退款', '说明']);
  });
});

describe('Bm25Index', () => {
  it('命中关键词更多的文档排前', () => {
    const index = new Bm25Index([
      { id: 'a', content: '冷冻商品签收后发现解冻变质可以申请退款补发' },
      { id: 'b', content: '退货退款政策说明' },
      { id: 'c', content: '会员积分规则' },
    ]);

    const hits = index.search('冷冻商品解冻退款', 5);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].id).toBe('a');
  });

  it('无任何命中时返回空数组', () => {
    const index = new Bm25Index([{ id: 'a', content: '退货政策' }]);
    expect(index.search('xyz', 5)).toEqual([]);
  });

  it('topK 限制返回数量', () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      content: `解冻 商品 ${i}`,
    }));
    const index = new Bm25Index(docs);
    expect(index.search('解冻 商品', 3)).toHaveLength(3);
  });
});