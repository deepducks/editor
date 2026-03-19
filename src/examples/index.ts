const minimal = `id: minimal
name: Minimal Workflow
version: "1"

participants:
  greet:
    type: exec
    run: echo "Hello, duckflux!"

flow:
  - greet
`;

const loop = `id: loop-example
name: Loop Workflow
version: "1"

participants:
  counter:
    type: exec
    run: echo "iteration"
    timeout: 5s

flow:
  - loop:
      until: counter.output == "done"
      max: 5
      steps:
        - counter
`;

const parallel = `id: parallel-example
name: Parallel Workflow
version: "1"

participants:
  lint:
    type: exec
    run: echo "linting"
  test:
    type: exec
    run: echo "testing"
  build:
    type: exec
    run: echo "building"
  report:
    type: exec
    run: echo "done"

flow:
  - parallel:
      - lint
      - test
      - build
  - report
`;

const conditional = `id: conditional-example
name: Conditional Workflow
version: "1"

participants:
  check:
    type: exec
    run: 'echo ''{"ready":true}'''
  deploy:
    type: exec
    run: echo "deploying"
  notify:
    type: http
    url: https://hooks.example.com/notify
    method: POST

flow:
  - check
  - if:
      condition: check.output.ready == true
      then:
        - deploy
      else:
        - notify
`;

const fullPipeline = `id: code-review
name: Code Review Pipeline
version: "1"

defaults:
  timeout: 5m

inputs:
  branch:
    type: string
    default: "main"
  max_rounds:
    type: integer
    default: 3

participants:
  coder:
    type: exec
    run: 'echo ''{"status":"coded"}'''
    timeout: 30s
    onError: retry
    retry:
      max: 2
      backoff: 1s
  reviewer:
    type: exec
    run: 'echo ''{"approved":true,"score":8}'''
    timeout: 30s

flow:
  - coder
  - loop:
      until: reviewer.output.approved == true
      max: 3
      as: review_round
      steps:
        - reviewer
        - coder:
            when: reviewer.output.approved == false
  - parallel:
      - type: exec
        as: tests
        run: echo "tests passed"
      - type: exec
        as: lint_check
        run: echo "lint passed"
  - wait:
      timeout: 5s
  - if:
      condition: tests.status == "success"
      then:
        - type: emit
          as: success_event
          event: pipeline.success
          payload:
            score: reviewer.output.score
      else:
        - type: http
          as: alert
          url: https://hooks.example.com/failure
          method: POST

output:
  approved: reviewer.output.approved
  score: reviewer.output.score
`;

export const examples = [
  { label: 'Minimal', yaml: minimal },
  { label: 'Loop', yaml: loop },
  { label: 'Parallel', yaml: parallel },
  { label: 'Conditional', yaml: conditional },
  { label: 'Full Pipeline', yaml: fullPipeline },
];
