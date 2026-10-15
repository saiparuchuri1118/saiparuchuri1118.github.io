// In-browser port of ragscope's example evaluation: the same BM25 retriever,
// corpus, golden set, metrics and gate as examples/run_eval.py, so the numbers
// match the repo's committed baseline exactly.
(() => {
  const root = document.getElementById("ragscope-demo");
  if (!root) return;

  const CORPUS = [
    ["doc-bm25", "BM25 is a lexical ranking function that scores a document by summing the contribution of each query term. Term frequency saturates: the second occurrence of a word adds far less than the first, controlled by the k1 parameter. Length normalisation, controlled by b, prevents long documents from winning purely by containing more words."],
    ["doc-vector-search", "Dense vector search encodes text into fixed-dimension embeddings and finds neighbours by cosine similarity or inner product. Approximate nearest neighbour indexes such as HNSW trade a small amount of recall for very large speed gains. Unlike lexical matching it can connect a query to a passage that shares no words with it."],
    ["doc-hybrid", "Hybrid search runs a lexical retriever and a dense retriever together and fuses the two ranked lists. Reciprocal rank fusion is a common combiner because it needs no score calibration between the systems. Hybrid retrieval covers the failure modes of each half: exact identifiers and rare terms favour lexical, paraphrase and synonym favour dense."],
    ["doc-reranking", "A cross-encoder reranker reads the query and a candidate passage together in a single forward pass, producing a far more accurate relevance judgement than comparing two independent embeddings. Because it is expensive it is applied only to a shortlist, typically the top fifty candidates from a cheaper first-stage retriever."],
    ["doc-chunking", "Chunking splits source material before indexing. Fixed-size windows with overlap are simple and predictable. Semantic chunking follows structural boundaries such as headings or paragraphs so a single chunk holds one coherent idea. Chunks that are too large dilute the embedding; chunks that are too small lose the context needed to answer."],
    ["doc-embeddings", "An embedding model maps text to a vector whose geometry encodes meaning. Dimensionality trades storage and query cost against expressiveness. Embeddings must be regenerated whenever the model version changes, because vectors from different models are not comparable and mixing them silently corrupts a vector index."],
    ["doc-opensearch", "Amazon OpenSearch Serverless offers a managed vector engine that stores embeddings alongside ordinary keyword fields, which makes it a common backing store for Bedrock Knowledge Bases. Because it indexes both, a single collection can serve the lexical and dense halves of a hybrid pipeline without a second datastore."],
    ["doc-guardrails", "Guardrails apply policy independently of the model. They filter disallowed topics, redact sensitive identifiers, and can require that a response cite retrieved context before it is returned. Running as a separate layer means the protection survives a change of underlying model."],
    ["doc-hallucination", "A model hallucinates when it asserts something the retrieved context does not support. Grounding reduces this by instructing the model to answer only from supplied passages and to say it does not know otherwise. Lowering sampling temperature narrows the output distribution and makes ungrounded invention less likely, though it never eliminates it."],
    ["doc-evaluation", "Retrieval quality is measured with rank-aware metrics. Recall at k asks what fraction of the known relevant documents were returned. Precision at k asks how much of the window was wasted. NDCG rewards placing the best document first rather than merely somewhere in the list, so it is the metric that moves when a reranker is added."],
    ["doc-latency", "Latency in a retrieval pipeline is dominated by the embedding call and the generation call, not by the index lookup. Caching embeddings for repeated queries removes an entire network round trip. Streaming the response to the client lowers perceived wait time even when total time is unchanged."],
    ["doc-cost", "Inference spend is driven by the number of tokens sent and the price of the model chosen. Routing straightforward requests to a smaller model and reserving the largest one for hard cases cuts spend substantially. Trimming retrieved context to the passages that are actually relevant reduces prompt tokens on every single call."],
  ];

  const GOLDEN = [
    { id: "q-saturation", question: "does repeating a word again and again keep increasing the score?", relevance: { "doc-bm25": 3 } },
    { id: "q-hybrid", question: "what is hybrid search and why combine two retrievers?", relevance: { "doc-hybrid": 3, "doc-bm25": 1, "doc-vector-search": 1 } },
    { id: "q-hallucination", question: "how do I stop the model making things up?", relevance: { "doc-hallucination": 3, "doc-guardrails": 2 } },
    { id: "q-metrics", question: "which metrics measure retrieval quality?", relevance: { "doc-evaluation": 3 } },
    { id: "q-splitting", question: "how should I break up source material before indexing it?", relevance: { "doc-chunking": 3, "doc-embeddings": 1 } },
    { id: "q-cost", question: "how can I spend less money on inference?", relevance: { "doc-cost": 3, "doc-latency": 1 } },
    { id: "q-crossencoder", question: "what does a cross-encoder reranker actually do?", relevance: { "doc-reranking": 3 } },
    { id: "q-aws-vectors", question: "where can I store embeddings on AWS?", relevance: { "doc-opensearch": 3, "doc-vector-search": 1 } },
    { id: "q-model-change", question: "what happens if I upgrade the embedding model?", relevance: { "doc-embeddings": 3 } },
    { id: "q-perceived-speed", question: "how do I make responses feel faster to the user?", relevance: { "doc-latency": 3 } },
  ];

  // Means from examples/baseline.json in the ragscope repo.
  const BASELINE = {
    "hit_rate@1": 0.7, "precision@1": 0.7, "recall@1": 0.4833333333333333, "ndcg@1": 0.7,
    "hit_rate@3": 0.9, "precision@3": 0.3333333333333333, "recall@3": 0.6833333333333333, "ndcg@3": 0.7391236606025329,
    "hit_rate@5": 1.0, "precision@5": 0.26, "recall@5": 0.8666666666666666, "ndcg@5": 0.820850012925835,
    "hit_rate@10": 1.0, "precision@10": 0.14, "recall@10": 0.9, "ndcg@10": 0.8245522955034426,
    "mrr": 0.8083333333333332,
  };

  const THRESHOLDS = { "recall@5": 0.6, "hit_rate@5": 0.7, "ndcg@5": 0.45 };
  const TOLERANCE = 0.02;
  const K_VALUES = [1, 3, 5, 10];
  const SHOWN = ["hit_rate@5", "precision@5", "recall@5", "ndcg@5", "mrr"];

  // ---- BM25 (examples/bm25.py) -------------------------------------------
  const tokenize = (text) => text.toLowerCase().match(/[a-z0-9]+/g) || [];

  function countTerms(tokens) {
    const counts = new Map();
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
    return counts;
  }

  function makeBM25(k1 = 1.5, b = 0.75) {
    const ids = CORPUS.map(([id]) => id);
    const tokens = CORPUS.map(([, text]) => tokenize(text));
    const freqs = tokens.map(countTerms);
    const n = ids.length;
    const avgLen = tokens.reduce((sum, t) => sum + t.length, 0) / n;
    const df = new Map();
    for (const f of freqs) for (const term of f.keys()) df.set(term, (df.get(term) || 0) + 1);
    const idf = new Map();
    for (const [term, count] of df) idf.set(term, Math.log(1 + (n - count + 0.5) / (count + 0.5)));

    function score(queryTokens, i) {
      const norm = k1 * (1 - b + (b * tokens[i].length) / avgLen);
      let total = 0;
      for (const term of queryTokens) {
        const tf = freqs[i].get(term) || 0;
        if (!tf) continue;
        total += ((idf.get(term) || 0) * (tf * (k1 + 1))) / (tf + norm);
      }
      return total;
    }

    return {
      retrieve(query, k) {
        const q = tokenize(query);
        return ids
          .map((id, i) => [score(q, i), id])
          .filter(([s]) => s > 0)
          .sort((x, y) => y[0] - x[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0))
          .slice(0, k)
          .map(([, id]) => id);
      },
    };
  }

  const bm25 = makeBM25();
  const RETRIEVERS = {
    baseline: bm25,
    // The repo's CI canary: a slicing bug that discards the top hit.
    "off-by-one": { retrieve: (q, k) => bm25.retrieve(q, k + 1).slice(1) },
    "top-2": { retrieve: (q, k) => bm25.retrieve(q, Math.min(k, 2)) },
    "no-tf": makeBM25(0, 0.75),
  };

  // ---- Metrics (src/ragscope/metrics/retrieval.py) -------------------------
  const relevantIds = (rel) => new Set(Object.keys(rel).filter((id) => rel[id] > 0));

  function hitRate(ids, relevant, k) {
    if (!relevant.size) return null;
    return ids.slice(0, k).some((id) => relevant.has(id)) ? 1 : 0;
  }
  function precision(ids, relevant, k) {
    return [...new Set(ids.slice(0, k))].filter((id) => relevant.has(id)).length / k;
  }
  function recall(ids, relevant, k) {
    if (!relevant.size) return null;
    return [...new Set(ids.slice(0, k))].filter((id) => relevant.has(id)).length / relevant.size;
  }
  function reciprocalRank(ids, relevant, k) {
    if (!relevant.size) return null;
    const pool = ids.slice(0, k);
    for (let i = 0; i < pool.length; i++) if (relevant.has(pool[i])) return 1 / (i + 1);
    return 0;
  }
  const dcg = (grades) => grades.reduce((sum, g, i) => sum + (2 ** g - 1) / Math.log2(i + 2), 0);
  function ndcg(ids, relevance, k) {
    const seen = new Set();
    const actual = ids.slice(0, k).map((id) => {
      if (seen.has(id)) return 0;
      seen.add(id);
      return relevance[id] || 0;
    });
    const ideal = dcg(Object.values(relevance).filter((g) => g > 0).sort((a, b) => b - a).slice(0, k));
    return ideal === 0 ? null : dcg(actual) / ideal;
  }

  // ---- Evaluate (src/ragscope/evaluator.py) --------------------------------
  function evaluate(retriever) {
    const widest = Math.max(...K_VALUES);
    const perMetric = {};
    const rankings = [];
    for (const ex of GOLDEN) {
      const ranking = retriever.retrieve(ex.question, widest);
      rankings.push(ranking);
      const relevant = relevantIds(ex.relevance);
      const m = {};
      for (const k of K_VALUES) {
        const ids = ranking.slice(0, k);
        m[`hit_rate@${k}`] = hitRate(ids, relevant, k);
        m[`precision@${k}`] = precision(ids, relevant, k);
        m[`recall@${k}`] = recall(ids, relevant, k);
        m[`ndcg@${k}`] = ndcg(ids, ex.relevance, k);
      }
      m.mrr = reciprocalRank(ranking, relevant, widest);
      for (const [name, value] of Object.entries(m)) (perMetric[name] ||= []).push(value);
    }
    const summary = {};
    for (const [name, values] of Object.entries(perMetric)) {
      const defined = values.filter((v) => v !== null);
      summary[name] = defined.length ? defined.reduce((a, b) => a + b, 0) / defined.length : null;
    }
    return { summary, rankings };
  }

  // ---- Gate (src/ragscope/gate.py) -----------------------------------------
  function gate(summary) {
    const violations = [];
    let checks = 1; // example-level errors: none possible here
    for (const [metric, minimum] of Object.entries(THRESHOLDS)) {
      checks++;
      const observed = summary[metric];
      if (observed < minimum) {
        violations.push(`${metric} ${observed.toFixed(4)} is below the minimum ${minimum.toFixed(4)}`);
      }
    }
    for (const metric of Object.keys(BASELINE).sort()) {
      checks++;
      const delta = summary[metric] - BASELINE[metric];
      if (delta < -TOLERANCE) {
        violations.push(
          `${metric} fell ${Math.abs(delta).toFixed(4)} (${BASELINE[metric].toFixed(4)} -> ${summary[metric].toFixed(4)}), tolerance ${TOLERANCE.toFixed(4)}`
        );
      }
    }
    return { violations, checks };
  }

  // ---- Render ----------------------------------------------------------------
  const output = root.querySelector("[data-output]");
  const questions = root.querySelector("[data-questions]");
  const details = root.querySelector("[data-details]");
  const pad = (text, width) => text.padEnd(width);
  const lpad = (text, width) => text.padStart(width);

  function render(variant) {
    const { summary, rankings } = evaluate(RETRIEVERS[variant]);
    const { violations, checks } = gate(summary);

    const lines = [
      `${pad("metric", 13)}${lpad("mean", 8)}${lpad("baseline", 10)}${lpad("change", 9)}`,
      "-".repeat(40),
    ];
    for (const metric of SHOWN) {
      const delta = summary[metric] - BASELINE[metric];
      const shown = Math.abs(delta) < 0.00005 ? "0.0000" : (delta > 0 ? "+" : "−") + Math.abs(delta).toFixed(4);
      const cls = delta < -TOLERANCE ? "c-bad" : delta > 0.00005 ? "c-good" : "c-dim";
      lines.push(
        `${pad(metric, 13)}${lpad(summary[metric].toFixed(4), 8)}${lpad(BASELINE[metric].toFixed(4), 10)}<span class="${cls}">${lpad(shown, 9)}</span>`
      );
    }
    lines.push("");
    if (violations.length) {
      lines.push(`<span class="c-bad">FAIL</span>  ${violations.length} of ${checks} check(s) failed`);
      for (const v of violations.slice(0, 4)) lines.push(`  x  ${v}`);
      if (violations.length > 4) lines.push(`  …and ${violations.length - 4} more`);
      lines.push("", "exit code 1: the build is blocked");
    } else {
      lines.push(`<span class="c-pass">PASS</span>  ${checks} check(s) satisfied`, "", "exit code 0: safe to merge");
    }
    output.innerHTML = lines.join("\n");

    questions.innerHTML = GOLDEN.map((ex, i) => {
      const hits = rankings[i].slice(0, 5).map((id) => {
        const grade = ex.relevance[id] || 0;
        return `<li class="${grade ? "doc-hit" : "doc-miss"}">${id}${grade ? ` <span>grade ${grade}</span>` : ""}</li>`;
      });
      return `<li><p>${ex.question}</p><ol class="pg-ranking">${hits.join("") || "<li class=\"doc-miss\">no results</li>"}</ol></li>`;
    }).join("");
  }

  for (const input of root.querySelectorAll('input[name="pg-variant"]')) {
    input.addEventListener("change", () => render(input.value));
  }
  details.hidden = false;
  render(root.querySelector('input[name="pg-variant"]:checked').value);
})();
