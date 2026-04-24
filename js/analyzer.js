// Cruza entradas de facturas contra inventario, detecta duplicados y descuadres.

(function (global) {
  "use strict";

  const { normalizeSerial, normalizeColor } = global.ParserModule;

  function prepareInventory(inventoryTauro) {
    return inventoryTauro.map(r => ({
      modelo: r.modelo,
      chasis: r.chasis,
      motor: r.motor,
      color: r.color,
      chasisNorm: normalizeSerial(r.chasis),
      motorNorm:  normalizeSerial(r.motor),
      colorNorm:  normalizeColor(r.color)
    }));
  }

  function groupBy(list, keyFn) {
    const map = new Map();
    list.forEach(item => {
      const k = keyFn(item);
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    });
    return map;
  }

  function findDuplicates(invoiceEntries) {
    const byChasis = groupBy(invoiceEntries, e => e.chasisNorm || null);
    const byMotor  = groupBy(invoiceEntries, e => e.motorNorm  || null);

    const seen = new Set();
    const duplicates = [];

    const pushGroup = (key, groupKey, entries) => {
      if (entries.length < 2) return;
      const signature = entries
        .map(e => `${e.file}#${e.page}`)
        .sort().join("|") + `::${groupKey}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      duplicates.push({ by: groupKey, key, entries });
    };

    for (const [k, v] of byChasis) pushGroup(k, "chasis", v);
    for (const [k, v] of byMotor)  pushGroup(k, "motor",  v);

    return duplicates;
  }

  function classifyAgainstInventory(invoiceEntries, inventory) {
    const matches = [];
    const missingInInventory = [];
    const hitInventoryIds = new Set();

    invoiceEntries.forEach(entry => {
      const idx = inventory.findIndex(inv =>
        (entry.chasisNorm && inv.chasisNorm && inv.chasisNorm === entry.chasisNorm) ||
        (entry.motorNorm  && inv.motorNorm  && inv.motorNorm  === entry.motorNorm)
      );

      if (idx === -1) {
        missingInInventory.push({ ...entry, reason: "No aparece en inventario" });
        return;
      }

      const inv = inventory[idx];
      hitInventoryIds.add(idx);

      const chasisOk = entry.chasisNorm && inv.chasisNorm && inv.chasisNorm === entry.chasisNorm;
      const motorOk  = entry.motorNorm  && inv.motorNorm  && inv.motorNorm  === entry.motorNorm;
      const colorOk  = entry.colorNorm  && inv.colorNorm  && inv.colorNorm  === entry.colorNorm;

      const allThree = chasisOk && motorOk && colorOk;
      matches.push({
        file: entry.file,
        page: entry.page,
        invoiceChasis: entry.chasis,
        invoiceMotor:  entry.motor,
        invoiceColor:  entry.color,
        inventoryChasis: inv.chasis,
        inventoryMotor:  inv.motor,
        inventoryColor:  inv.color,
        chasisOk: !!chasisOk,
        motorOk:  !!motorOk,
        colorOk:  !!colorOk,
        status: allThree ? "exacto" : "parcial"
      });
    });

    const notInvoiced = inventory
      .filter((_, i) => !hitInventoryIds.has(i))
      .map(inv => ({ ...inv }));

    return { matches, missingInInventory, notInvoiced };
  }

  function crossReference(inventoryTauros, invoiceEntries, invoiceFileNames) {
    const inventory = prepareInventory(inventoryTauros);
    const duplicates = findDuplicates(invoiceEntries);
    const { matches, missingInInventory, notInvoiced } =
      classifyAgainstInventory(invoiceEntries, inventory);

    return {
      summary: {
        invoices: invoiceFileNames.length,
        tauroEntries: invoiceEntries.length,
        duplicates: duplicates.length,
        missingInInventory: missingInInventory.length,
        notInvoiced: notInvoiced.length,
        matchesExact: matches.filter(m => m.status === "exacto").length,
        matchesPartial: matches.filter(m => m.status === "parcial").length
      },
      duplicates,
      matches,
      missingInInventory,
      notInvoiced
    };
  }

  global.AnalyzerModule = { crossReference };
})(window);
