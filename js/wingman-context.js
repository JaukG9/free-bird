/**
 * Builds the session context Wingman replies are composed from.
 *
 * This is the piece that stops Wingman behaving like a generic chatbot: every
 * reply is assembled against the user's own stressor, pressure estimate,
 * detected drivers, plan, completed exercises, and check-in state.
 */
(function (FB) {
  'use strict';

  function build() {
    var state = FB.state.get();
    var session = state.session;

    if (!session || !session.profile) {
      return {
        hasAnalysis: false,
        subject: null,
        drivers: [],
        patterns: [],
        pressure: null,
        plan: null,
        completedExercises: [],
        checkin: null,
        mode: FB.model.isReady() ? 'on-device' : 'rules'
      };
    }

    var profile = session.profile;

    return {
      hasAnalysis: true,
      stressor: profile.text,
      subject: profile.subject,
      topic: profile.context.topic,
      timeframe: profile.context.timeframe,
      primarySignal: profile.primarySignal,
      drivers: FB.recommendations.driversFor(profile),
      patterns: profile.patterns,
      pressure: profile.pressure,
      plan: session.plan,
      completedExercises: session.exerciseLog.map(function (entry) {
        var exercise = FB.exercises.get(entry.exerciseId);
        return exercise ? { id: exercise.id, title: exercise.title, category: exercise.category } : null;
      }).filter(Boolean),
      checkin: session.checkin,
      mode: FB.model.isReady() ? 'on-device' : 'rules'
    };
  }

  /** A short human summary of the context, shown above the conversation. */
  function summaryLines() {
    var ctx = build();
    if (!ctx.hasAnalysis) return [];

    var lines = [];
    if (ctx.subject) lines.push({ label: 'Situation', value: ctx.subject });
    if (ctx.pressure) lines.push({ label: 'Pressure', value: ctx.pressure.value + '/10' });
    if (ctx.drivers.length) lines.push({ label: 'Main driver', value: ctx.drivers[0].label });

    var next = FB.fallback.currentStep(ctx);
    if (next) {
      var exercise = FB.exercises.get(next.exerciseId);
      if (exercise) lines.push({ label: 'Next step', value: exercise.title });
    } else if (ctx.plan) {
      lines.push({ label: 'Plan', value: 'All three steps done' });
    }
    if (ctx.completedExercises.length) {
      lines.push({ label: 'Completed', value: String(ctx.completedExercises.length) + ' exercise' + (ctx.completedExercises.length === 1 ? '' : 's') });
    }
    return lines;
  }

  FB.wingmanContext = {
    build: build,
    summaryLines: summaryLines
  };
})(window.FB = window.FB || {});
