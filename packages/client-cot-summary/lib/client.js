window.__ModuleLoader__.load({ id: '@shenjack/dsh-client-cot-summary', factory: (require) => {
  var module = { exports: {} }
  var exports = module.exports
  var React = require('react')
  var ui = require('@deepseek-ai/dsh-client-ui-primitives')

  function segmentKey(value) {
    return String(value.turn) + ':' + String(value.step) + ':' + String(value.reasoningIndex) + ':' + String(value.segmentIndex)
  }

  function replaceSegment(segments, next) {
    var key = segmentKey(next)
    var index = segments.findIndex(function (segment) { return segmentKey(segment) === key })
    var updated = index === -1 ? segments.concat([next]) : segments.with(index, next)
    return updated.toSorted(function (left, right) {
      return left.reasoningIndex - right.reasoningIndex || left.segmentIndex - right.segmentIndex
    })
  }

  var cotSummaryRowDefinition = {
    kind: 'cot-summary-row',
    target: 'chat',
    match: function (event) {
      if (event.type === 'step/start') return { id: String(event.data.turn) + ':' + String(event.data.step), role: 'start' }
      if (event.type === 'cot-summary/delta' || event.type === 'cot-summary/settled' || event.type === 'cot-summary/reset') {
        return { id: String(event.data.turn) + ':' + String(event.data.step), role: 'update' }
      }
      return null
    },
    start: function (_context, match) {
      if (match.event.type !== 'step/start') throw new Error('cot-summary-row 必须由 step/start 启动')
      return { turn: match.event.data.turn, step: match.event.data.step, segments: [] }
    },
    update: function (context, match) {
      var state = context.state
      if (match.event.type === 'cot-summary/reset') return Object.assign({}, state, { segments: [] })
      if (match.event.type === 'cot-summary/settled') {
        return Object.assign({}, state, { segments: replaceSegment(state.segments, match.event.data) })
      }
      if (match.event.type === 'cot-summary/delta') {
        var index = state.segments.findIndex(function (segment) { return segmentKey(segment) === segmentKey(match.event.data) })
        if (match.event.data.kind === 'discard') {
          return index === -1 ? state : Object.assign({}, state, { segments: state.segments.toSpliced(index, 1) })
        }
        var previous = index === -1 ? undefined : state.segments[index]
        return Object.assign({}, state, {
          segments: replaceSegment(state.segments, {
            turn: match.event.data.turn,
            step: match.event.data.step,
            reasoningIndex: match.event.data.reasoningIndex,
            segmentIndex: match.event.data.segmentIndex,
            text: (previous ? previous.text : '') + match.event.data.text,
            status: 'streaming',
          }),
        })
      }
      return state
    },
    publication: function (match) { return match.event.type === 'cot-summary/delta' ? 'animation-frame' : 'immediate' },
    buildViewNode: function (context) {
      var state = context.state
      var start = context.start
      if (!state || !start || state.segments.length === 0) return null
      var last = context.matches[context.matches.length - 1]
      var latest = last ? last.event.seq : start.event.seq
      return {
        key: context.key,
        kind: 'cot-summary-row',
        id: context.id,
        target: 'chat',
        anchorSeq: latest + 0.1,
        location: start.location,
        visibility: 'visible',
        data: {
          turn: state.turn,
          step: state.step,
          segments: state.segments,
          running: state.segments.some(function (segment) { return segment.status === 'streaming' }),
        },
      }
    },
  }

  function preview(data) {
    if (data.running) return '正在整理思考摘要…'
    var text = data.segments.map(function (segment) { return segment.text }).join(' ')
    var firstLine = text.split('\n', 1)[0] || ''
    return firstLine === '' ? '思考摘要已完成' : firstLine
  }

  function CotSummaryRow(props) {
    var state = React.useState(true)
    var open = state[0]
    var setOpen = state[1]
    var data = props.node.data
    var text = data.segments.map(function (segment) { return segment.text }).join('\n\n')
    return React.createElement(
      'section',
      { 'data-cot-summary-row': '' },
      React.createElement(
        ui.DisclosureRow,
        {
          icon: React.createElement(ui.IconThinkOutline14, { size: 14 }),
          title: '思考摘要',
          open: open,
          expandable: true,
          expandOnRowClick: true,
          onToggle: function () { setOpen(function (value) { return !value }) },
          collapsedContent: React.createElement('span', null, preview(data)),
        },
        React.createElement('div', { style: { padding: '4px 0 4px 22px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, text),
      ),
    )
  }

  module.exports.inject = ['conversationEvents', 'slots']
  module.exports.apply = function (ctx) {
    ctx.conversationEvents.register(cotSummaryRowDefinition)
    ctx.slots.inject('conversation.chat.node', function () {
      return ctx.slots.register({ name: 'conversation.chat.node', key: 'cot-summary-row' }, CotSummaryRow)
    })
  }
  return module.exports
} });
