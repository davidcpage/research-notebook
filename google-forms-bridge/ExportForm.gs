/**
 * Export Google Form structure to quiz JSON format.
 *
 * Maps Google Forms question types to our quiz schema for importing
 * forms as quiz cards in the research notebook.
 */
var ExportForm = (function() {

  /**
   * Export form structure to quiz-compatible JSON.
   *
   * @param {string} formId - The Google Form ID
   * @returns {Object} Quiz-compatible JSON structure
   */
  function exportToJSON(formId) {
    var form = FormApp.openById(formId);
    var items = form.getItems();
    var questions = [];
    var warnings = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var result = convertItem(item, i);

      if (result.question) {
        questions.push(result.question);
      }
      if (result.warning) {
        warnings.push(result.warning);
      }
    }

    return {
      // Quiz card fields
      title: form.getTitle(),
      description: form.getDescription() || '',
      questions: questions,

      // Metadata for tracking
      _import: {
        source: 'google_forms',
        formId: formId,
        formUrl: form.getEditUrl(),
        publishedUrl: form.getPublishedUrl(),
        isQuiz: form.isQuiz(),
        importedAt: new Date().toISOString(),
        warnings: warnings
      }
    };
  }

  /**
   * Convert a form item to quiz question format.
   *
   * @param {Item} item - The form item
   * @param {number} index - Item index
   * @returns {Object} { question: {...} | null, warning: string | null }
   */
  function convertItem(item, index) {
    var type = item.getType();
    var baseQuestion = {
      question: item.getTitle(),
      hint: item.getHelpText() || undefined
    };

    switch (type) {
      case FormApp.ItemType.MULTIPLE_CHOICE:
        return convertMultipleChoice(item.asMultipleChoiceItem(), baseQuestion);

      case FormApp.ItemType.CHECKBOX:
        return convertCheckbox(item.asCheckboxItem(), baseQuestion);

      case FormApp.ItemType.LIST:
        return convertDropdown(item.asListItem(), baseQuestion);

      case FormApp.ItemType.TEXT:
        return convertShortAnswer(item.asTextItem(), baseQuestion);

      case FormApp.ItemType.PARAGRAPH_TEXT:
        return convertParagraph(item.asParagraphTextItem(), baseQuestion);

      case FormApp.ItemType.SCALE:
        return convertScale(item.asScaleItem(), baseQuestion);

      case FormApp.ItemType.GRID:
        return convertGrid(item.asGridItem(), baseQuestion);

      case FormApp.ItemType.CHECKBOX_GRID:
        return convertCheckboxGrid(item.asCheckboxGridItem(), baseQuestion);

      // Non-question items - skip with info
      case FormApp.ItemType.SECTION_HEADER:
      case FormApp.ItemType.PAGE_BREAK:
        return {
          question: null,
          warning: 'Skipped ' + getTypeName(type) + ': "' + item.getTitle() + '"'
        };

      case FormApp.ItemType.IMAGE:
      case FormApp.ItemType.VIDEO:
        return {
          question: null,
          warning: 'Skipped ' + getTypeName(type) + ' (not supported in quiz cards)'
        };

      // Unsupported question types
      case FormApp.ItemType.DATE:
      case FormApp.ItemType.TIME:
      case FormApp.ItemType.DATETIME:
      case FormApp.ItemType.DURATION:
        return {
          question: Object.assign({}, baseQuestion, {
            type: 'short_answer',
            _originalType: getTypeName(type)
          }),
          warning: getTypeName(type) + ' converted to short_answer: "' + item.getTitle() + '"'
        };

      default:
        return {
          question: null,
          warning: 'Unknown item type at index ' + index + ': ' + type
        };
    }
  }

  /**
   * Convert multiple choice (radio) question.
   */
  function convertMultipleChoice(item, base) {
    var choices = item.getChoices();
    var options = [];
    var correctIndex = null;

    for (var i = 0; i < choices.length; i++) {
      options.push(choices[i].getValue());
      if (choices[i].isCorrectAnswer()) {
        correctIndex = i;
      }
    }

    return {
      question: Object.assign({}, base, {
        type: 'multiple_choice',
        options: options,
        correct: correctIndex,
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: null
    };
  }

  /**
   * Convert checkbox (multi-select) question.
   */
  function convertCheckbox(item, base) {
    var choices = item.getChoices();
    var options = [];
    var correctIndices = [];

    for (var i = 0; i < choices.length; i++) {
      options.push(choices[i].getValue());
      if (choices[i].isCorrectAnswer()) {
        correctIndices.push(i);
      }
    }

    return {
      question: Object.assign({}, base, {
        type: 'checkbox',
        options: options,
        correctMultiple: correctIndices.length > 0 ? correctIndices : undefined,
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: null
    };
  }

  /**
   * Convert dropdown (list) question.
   */
  function convertDropdown(item, base) {
    var choices = item.getChoices();
    var options = [];
    var correctIndex = null;

    for (var i = 0; i < choices.length; i++) {
      options.push(choices[i].getValue());
      if (choices[i].isCorrectAnswer()) {
        correctIndex = i;
      }
    }

    return {
      question: Object.assign({}, base, {
        type: 'dropdown',
        options: options,
        correct: correctIndex,
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: null
    };
  }

  /**
   * Convert short answer (text) question.
   */
  function convertShortAnswer(item, base) {
    return {
      question: Object.assign({}, base, {
        type: 'short_answer',
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: null
    };
  }

  /**
   * Convert paragraph (long text) question.
   */
  function convertParagraph(item, base) {
    return {
      question: Object.assign({}, base, {
        type: 'worked',
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: null
    };
  }

  /**
   * Convert scale question.
   */
  function convertScale(item, base) {
    return {
      question: Object.assign({}, base, {
        type: 'scale',
        low: item.getLowerBound(),
        high: item.getUpperBound(),
        lowLabel: item.getLeftLabel() || undefined,
        highLabel: item.getRightLabel() || undefined,
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: null
    };
  }

  /**
   * Convert grid question (single selection per row).
   */
  function convertGrid(item, base) {
    return {
      question: Object.assign({}, base, {
        type: 'grid',
        rows: item.getRows(),
        columns: item.getColumns(),
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: null
    };
  }

  /**
   * Convert checkbox grid question (multiple selections per row).
   */
  function convertCheckboxGrid(item, base) {
    return {
      question: Object.assign({}, base, {
        type: 'grid',
        rows: item.getRows(),
        columns: item.getColumns(),
        allowMultiplePerRow: true,
        points: item.getPoints() || 1,
        required: item.isRequired()
      }),
      warning: 'Checkbox grid converted to grid (multi-select per row): "' + item.getTitle() + '"'
    };
  }

  /**
   * Get human-readable type name.
   */
  function getTypeName(type) {
    var names = {};
    names[FormApp.ItemType.MULTIPLE_CHOICE] = 'Multiple Choice';
    names[FormApp.ItemType.CHECKBOX] = 'Checkbox';
    names[FormApp.ItemType.LIST] = 'Dropdown';
    names[FormApp.ItemType.TEXT] = 'Short Answer';
    names[FormApp.ItemType.PARAGRAPH_TEXT] = 'Paragraph';
    names[FormApp.ItemType.SCALE] = 'Scale';
    names[FormApp.ItemType.GRID] = 'Grid';
    names[FormApp.ItemType.CHECKBOX_GRID] = 'Checkbox Grid';
    names[FormApp.ItemType.DATE] = 'Date';
    names[FormApp.ItemType.TIME] = 'Time';
    names[FormApp.ItemType.DATETIME] = 'DateTime';
    names[FormApp.ItemType.DURATION] = 'Duration';
    names[FormApp.ItemType.SECTION_HEADER] = 'Section Header';
    names[FormApp.ItemType.PAGE_BREAK] = 'Page Break';
    names[FormApp.ItemType.IMAGE] = 'Image';
    names[FormApp.ItemType.VIDEO] = 'Video';
    return names[type] || 'Unknown';
  }

  // Public API
  return {
    exportToJSON: exportToJSON
  };

})();
