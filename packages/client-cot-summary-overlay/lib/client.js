window.__ModuleLoader__.load({ id: '@shenjack/dsh-client-cot-summary-overlay', factory: (require) => {
  var module = { exports: {} }
  var exports = module.exports
  var React = require('react')
  var ui = require('@deepseek-ai/dsh-client-ui-primitives')

  function createToggle() {
    var value = true
    var listeners = new Set()
    return {
      source: {
        getSnapshot: function () { return value },
        subscribe: function (listener) {
          listeners.add(listener)
          return function () { listeners.delete(listener) }
        },
      },
      set: function (next) {
        if (value === next) return
        value = next
        listeners.forEach(function (listener) { listener() })
      },
    }
  }

  function summaryText(projection, owner) {
    if (projection === undefined) return ''
    return projection.segments
      .filter(function (segment) {
        return segment.turn === owner.turn
          && segment.step === owner.step
          && segment.reasoningIndex === owner.reasoningIndex
      })
      .map(function (segment) { return segment.text })
      .join('\n\n')
  }

  function CotReasoningRow(props) {
    var matched = props.matched
    var useProjection = props.useProjection
    var summaryVisible = props.useSummaryVisible()
    var setSummaryVisible = props.setSummaryVisible
    var summary = useProjection('cot-summary', function (projection) { return summaryText(projection, matched) })
    var summaryState = React.useState(true)
    var summaryExpanded = summaryState[0]
    var setSummaryExpanded = summaryState[1]
    var rawState = React.useState(true)
    var rawExpanded = rawState[0]
    var setRawExpanded = rawState[1]
    var previousRunning = React.useRef(matched.running)

    React.useEffect(function () {
      if (previousRunning.current && !matched.running) setSummaryExpanded(false)
      previousRunning.current = matched.running
    }, [matched.running])

    if (!summaryVisible) {
      return React.createElement(
        ui.DisclosureRow,
        {
          title: '原始思考',
          icon: React.createElement(ui.IconThinkOutline14, { size: 14 }),
          open: rawExpanded,
          expandable: true,
          expandOnRowClick: true,
          onToggle: function () { setRawExpanded(function (value) { return !value }) },
        }, React.createElement('div', null, matched.text))
    }

    var body = summary === ''
      ? React.createElement('p', null, matched.running ? '正在整理思考摘要…' : '等待摘要完成…')
      : React.createElement('div', null, summary)
    var switchToRaw = function (event) {
      event.stopPropagation()
      setSummaryVisible(false)
    }
    return React.createElement(
      ui.DisclosureRow,
      {
        title: '思考摘要',
        icon: React.createElement(ui.IconThinkOutline14, { size: 14 }),
        open: summaryExpanded,
        expandable: true,
        expandOnRowClick: true,
        onToggle: function () { setSummaryExpanded(function (value) { return !value }) },
        collapsedContent: React.createElement('button', { type: 'button', onClick: switchToRaw }, '查看原始思考'),
      },
      body,
      React.createElement('button', { type: 'button', onClick: switchToRaw }, '查看原始思考'),
    )
  }

  module.exports.inject = ['slots']
  module.exports.apply = function (ctx) {
    var toggle = createToggle()
    ctx.slots.inject('conversation.chat.reasoning', function () {
      return ctx.slots.register({
        name: 'conversation.chat.reasoning',
        select: function (owner) { return owner },
        inject: function () {
          return {
            setSummaryVisible: function (visible) { toggle.set(visible) },
            hooks: { summaryVisible: toggle.source },
          }
        },
      }, CotReasoningRow)
    })
  }
  return module.exports
} });
