<?php
/**
 * Filtre Çubuğu Bileşeni
 * Değişkenler: $filtreler (array of filter definitions)
 * Her filtre: ['type' => 'select|text|number', 'name' => ..., 'label' => ..., 'options' => [...]]
 */
?>
<form method="GET" class="flex flex-wrap gap-3 items-center" id="filtre-form">
    <?php foreach ($filtreler ?? [] as $filtre): ?>

    <?php if ($filtre['type'] === 'select'): ?>
    <select name="<?= e($filtre['name']) ?>"
            onchange="this.form.submit()"
            class="text-sm px-3 py-2 rounded-xl border outline-none"
            style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4; min-width: 130px;">
        <option value=""><?= e($filtre['label']) ?></option>
        <?php foreach ($filtre['options'] ?? [] as $val => $lbl): ?>
        <option value="<?= e($val) ?>" <?= ($_GET[$filtre['name']] ?? '') === (string)$val ? 'selected' : '' ?>>
            <?= e($lbl) ?>
        </option>
        <?php endforeach; ?>
    </select>

    <?php elseif ($filtre['type'] === 'text'): ?>
    <input type="text"
           name="<?= e($filtre['name']) ?>"
           value="<?= e($_GET[$filtre['name']] ?? '') ?>"
           placeholder="<?= e($filtre['label']) ?>"
           class="text-sm px-3 py-2 rounded-xl border outline-none"
           style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4; min-width: 160px;">

    <?php elseif ($filtre['type'] === 'number'): ?>
    <input type="number"
           name="<?= e($filtre['name']) ?>"
           value="<?= e($_GET[$filtre['name']] ?? '') ?>"
           placeholder="<?= e($filtre['label']) ?>"
           class="text-sm px-3 py-2 rounded-xl border outline-none"
           style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4; min-width: 130px;">

    <?php elseif ($filtre['type'] === 'date'): ?>
    <input type="text"
           name="<?= e($filtre['name']) ?>"
           value="<?= e($_GET[$filtre['name']] ?? '') ?>"
           placeholder="<?= e($filtre['label']) ?>"
           class="datepicker text-sm px-3 py-2 rounded-xl border outline-none"
           style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #e8ecf4; min-width: 130px;"
           readonly>
    <?php endif; ?>

    <?php endforeach; ?>

    <button type="submit"
            class="text-sm px-4 py-2 rounded-xl font-medium transition-colors"
            style="background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);">
        Filtrele
    </button>

    <a href="?" class="text-sm px-3 py-2 rounded-xl transition-colors"
       style="background: rgba(255,255,255,0.04); color: #7a8599; border: 1px solid rgba(255,255,255,0.06);">
        Temizle
    </a>
</form>
