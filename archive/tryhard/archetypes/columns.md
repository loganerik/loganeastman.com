---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
description: ""
draft: true
categories: []        # broad subjects, e.g. Observations, Culture, Technology
tags: []              # recurring ideas, e.g. coincidence, attention, Los Angeles
cover:
  style: ""           # optional: lines | waves | steps | rays | arches | scallops
  accent: ""          # optional: sage | rose | jade | brown | olive
  # image: "photo.jpg"   # optional, placed next to this index.md
  # alt: ""
  # caption: ""
  # duotone: false
  # hero: true        # false = use the image for covers and sharing only, not at the top of the column
  # focus: smart      # crop anchor for covers: smart | center | top | bottom | left | right
---

The first paragraph.

## A section heading

Text follows.

### A smaller thought

More text.

{{</* pullquote */>}}A line worth setting apart.{{</* /pullquote */>}}

{{</* aside */>}}A small digression.{{</* /aside */>}}

{{</* ornament */>}}
