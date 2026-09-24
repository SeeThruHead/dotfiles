# Storybook for all component UI work

Any time a UI component is being built or changed, Storybook is where it is
looked at. Not the running app, which needs a login and live data, and not a
unit test, which cannot show what a thing looks like.

## One story shows every state

The point of Storybook is a single story that lays out the component in every
state you would need to visually check while coding, side by side, so you can
see all of them at once without clicking through the UI to reach each one.

For a component that has states, write a `*States` story that renders them in a
column with a label beside each. Typical states: empty / default, the "one of"
case and the "many of" case for anything that shows a count or a list, disabled
or locked, loading, error, filtering active, and whatever the longest realistic
content looks like. If a badge, count or label could change the size of a
control, that state goes in the story, because sizing is where things break.

Seed state through the component's own inputs (a pre-loaded storage, a prop, a
fixture), never by clicking in the story. A story you have to interact with to
reach the interesting state has failed at its job.

## Look before saying it is done

Open the story and screenshot it before declaring visual work finished, and read
the screenshot. "It typechecks and the tests pass" says nothing about how it
looks. A button that doubled in height because a badge wrapped under its label
passed every test.

## Where

- ui-kit-admin stories: `pnpm --filter @trm/ui-kit-admin run storybook` on 6007
- admin app stories: `pnpm --filter @trm/admin storybook` on 6006
- open the isolated canvas with
  `agent-browser open "http://localhost:<port>/iframe.html?id=<story-id>&viewMode=story"`
  and find the id in `/index.json`; never guess it
