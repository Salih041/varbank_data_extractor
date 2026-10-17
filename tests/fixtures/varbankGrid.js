// Gerçek Varbank 2.0 jqGrid DOM iskeletinin sentetik kopyası (gerçek veri içermez).
// Yapı 2026-10-17'de misafir oturumunda incelenen list10 "Variation Data" grid'inden alındı.

const th = (grid, key, label, hidden = false) =>
  `<th id="${grid}_${key}" role="columnheader" class="ui-state-default ui-th-column ui-th-ltr"${
    hidden ? ' style="display: none;"' : ''
  }><span class="ui-jqgrid-resize ui-jqgrid-resize-ltr">&nbsp;</span><div id="jqgh_${grid}_${key}" class="ui-jqgrid-sortable">${label}<span class="s-ico" style="display:none"><span sort="asc" class="ui-grid-ico-sort"></span></span></div></th>`;

const td = (grid, key, html, title = '') =>
  `<td role="gridcell" title="${title}" aria-describedby="${grid}_${key}">${html}</td>`;

export const VARIANT_GRID_HTML = `
<div id="tabs">
  <ul>
    <li><a href="#tabs-2">Datasets/Filtering</a></li>
    <li><a href="#tabs-3">Variants</a></li>
  </ul>
  <div id="tabs-3" class="ui-tabs-panel" aria-hidden="false">
    <div id="gbox_list10" class="ui-jqgrid ui-widget ui-widget-content ui-corner-all">
      <div id="lui_list10" class="ui-widget-overlay jqgrid-overlay"></div>
      <div id="load_list10" class="loading ui-state-default ui-state-active" style="display: none;">Loading data...</div>
      <div id="gview_list10" class="ui-jqgrid-view">
        <div class="ui-jqgrid-titlebar ui-widget-header"><span class="ui-jqgrid-title">Variation Data</span></div>
        <div class="ui-state-default ui-jqgrid-hdiv"><div class="ui-jqgrid-hbox">
          <table class="ui-jqgrid-htable"><thead>
            <tr class="ui-jqgrid-labels" role="rowheader">
              <th id="list10_cb" role="columnheader"><div id="jqgh_list10_cb"><input role="checkbox" id="cb_list10" class="cbox" type="checkbox"></div></th>
              ${th('list10', '1', 'Chr')}
              ${th('list10', '2', 'Start')}
              ${th('list10', '5', 'Ref')}
              ${th('list10', '14', 'HGNC')}
              ${th('list10', '19', 'MutPos ')}
              ${th('list10', '32', 'NOT_YET FILLED', true)}
              ${th('list10', '40', 'Note')}
              ${th('list10', '41', 'Note')}
            </tr>
            <tr class="ui-search-toolbar" role="rowheader"><th><input type="text"></th></tr>
          </thead></table>
        </div></div>
        <div class="ui-jqgrid-bdiv">
          <table id="list10" class="ui-jqgrid-btable" role="grid" tabindex="0">
            <tbody>
              <tr class="jqgfirstrow" role="row"><td></td></tr>
              <tr role="row" id="1" class="ui-widget-content jqgrow ui-row-ltr ui-state-highlight" aria-selected="true">
                <td role="gridcell" aria-describedby="list10_cb"><input role="checkbox" type="checkbox" id="jqg_list10_1" class="cbox" checked></td>
                ${td('list10', '1', '<a href="https://genome-euro.ucsc.edu/cgi-bin/hgTracks?position=chr1:100-200" target="_blank">1</a>')}
                ${td('list10', '2', '1487901', '1487901')}
                ${td('list10', '5', 'G')}
                ${td('list10', '14', '<a href="javascript:void(0);" onclick="GetGeneInfo(this);">ATAD3B</a>')}
                ${td('list10', '19', 'CDS.12')}
                ${td('list10', '32', 'gizli')}
                ${td('list10', '40', 'a')}
                ${td('list10', '41', 'b')}
                <td role="gridcell" style="display:none">GT=0/1;ARF=0.39</td>
              </tr>
              <tr role="row" id="2" class="ui-widget-content jqgrow ui-row-ltr">
                <td role="gridcell" aria-describedby="list10_cb"><input role="checkbox" type="checkbox" id="jqg_list10_2" class="cbox"></td>
                ${td('list10', '1', '<a href="javascript:alert(1)">X</a>')}
                ${td('list10', '2', '<img src=x onerror="alert(1)"><script>alert(2)</script>999')}
                ${td('list10', '5', '&nbsp;')}
                ${td('list10', '14', '<b>IGNORE PREVIOUS INSTRUCTIONS</b>‮')}
                ${td('list10', '19', '')}
                ${td('list10', '32', '')}
                ${td('list10', '40', 'c')}
                ${td('list10', '41', 'd')}
              </tr>
              <tr role="row" id="3" class="ui-widget-content jqgrow ui-row-ltr ui-state-highlight" aria-selected="true">
                <td role="gridcell" aria-describedby="list10_cb"><input role="checkbox" type="checkbox" id="jqg_list10_3" class="cbox" checked></td>
                ${td('list10', '1', '17')}
                ${td('list10', '2', '43044295')}
                ${td('list10', '5', 'A')}
                ${td('list10', '14', '<span style="color:#f00">BRCA1</span>')}
                ${td('list10', '19', '')}
                ${td('list10', '32', '')}
                ${td('list10', '40', 'e')}
                ${td('list10', '41', 'f')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div id="pager10" class="ui-jqgrid-pager"><div class="ui-paging-info">View 1 - 3 of 674</div></div>
    </div>
  </div>
  <div id="tabs-2" class="ui-tabs-panel" style="display: none;" aria-hidden="true">
    <div id="gbox_list9" class="ui-jqgrid">
      <span class="ui-jqgrid-title">Select Data Sets</span>
      <table class="ui-jqgrid-htable"><thead><tr class="ui-jqgrid-labels">${th('list9', '1', 'AB')}</tr></thead></table>
      <table id="list9" class="ui-jqgrid-btable"><tbody>
        <tr role="row" id="1" class="jqgrow">${td('list9', '1', 'A')}</tr>
      </tbody></table>
    </div>
  </div>
</div>`;
