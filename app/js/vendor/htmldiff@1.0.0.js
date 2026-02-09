/**
 * htmldiff.js — Vanilla JavaScript HTML diff library
 * Source: https://github.com/frattaro/htmldiff.js (MIT License)
 * Wrapped as ES module for no-build-step usage.
 *
 * Usage:
 *   import { HtmlDiff } from './vendor/htmldiff@1.0.0.js';
 *   const diff = new HtmlDiff(oldHtml, newHtml);
 *   const result = diff.Build();
 */

function HtmlDiff(oldText, newText) {
    this.MatchGranularityMaximum = 4;

    this._content = [];
    this._newText = newText;
    this._oldText = oldText;
    var that = this;

    this._specialCaseClosingTags = {
        '</strong>': 0,
        '</em>': 0,
        '</b>': 0,
        '</i>': 0,
        '</big>': 0,
        '</small>': 0,
        '</u>': 0,
        '</sub>': 0,
        '</sup>': 0,
        '</strike>': 0,
        '</s>': 0
    };

    this._specialCaseOpeningTagRegex = new RegExp(/<((strong)|(b)|(i)|(em)|(big)|(small)|(u)|(sub)|(sup)|(strike)|(s))[\>\s]+/i);

    this._specialTagDiffStack = [];

    this._newWords;
    this._oldWords;
    this._matchGranularity;
    this._blockExpressions = [];

    this.RepeatingWordsAccuracy = 1;
    this.IgnoreWhitespaceDifferences = false;
    this.OrphanMatchThreshold = 0;

    this.Build = function () {
        if (that._oldText == that._newText) {
            return that._newText;
        }

        SplitInputsToWords();

        that._matchGranularity = Math.min(that.MatchGranularityMaximum, Math.min(that._oldWords.length, that._newWords.length));

        let operations = Operations();

        for (let i = 0; i < operations.length; i++) {
            PerformOperation(operations[i]);
        }

        return that._content.join('');
    };

    this.AddBlockExpression = function (expression) {
        that._blockExpressions.push(expression);
    };

    var SplitInputsToWords = function () {
        that._oldWords = HtmlDiff.WordSplitter.ConvertHtmlToListOfWords(that._oldText, that._blockExpressions);
        that._oldText = null;

        that._newWords = HtmlDiff.WordSplitter.ConvertHtmlToListOfWords(that._newText, that._blockExpressions);
        that._newText = null;
    };

    var PerformOperation = function (operation) {
        switch (operation.Action) {
            case HtmlDiff.Action.Equal:
                ProcessEqualOperation(operation);
                break;
            case HtmlDiff.Action.Delete:
                ProcessDeleteOperation(operation, 'diffdel');
                break;
            case HtmlDiff.Action.Insert:
                ProcessInsertOperation(operation, 'diffins');
                break;
            case HtmlDiff.Action.None:
                break;
            case HtmlDiff.Action.Replace:
                ProcessReplaceOperation(operation);
                break;
        }
    };

    var ProcessReplaceOperation = function (operation) {
        ProcessDeleteOperation(operation, 'diffmod');
        ProcessInsertOperation(operation, 'diffmod');
    };

    var ProcessInsertOperation = function (operation, cssClass) {
        InsertTag('ins', cssClass, that._newWords.slice(operation.StartInNew, operation.EndInNew));
    };

    var ProcessDeleteOperation = function (operation, cssClass) {
        InsertTag('del', cssClass, that._oldWords.slice(operation.StartInOld, operation.EndInOld));
    };

    var ProcessEqualOperation = function (operation) {
        that._content.push(that._newWords.slice(operation.StartInNew, operation.EndInNew).join(''));
    };

    var InsertTag = function (tag, cssClass, words) {
        while (true) {
            if (words.length === 0) {
                break;
            }

            let nonTags = ExtractConsecutiveWords(words, function (x) { return !HtmlDiff.Utils.IsTag(x); });

            let specialCaseTagInjection = '';
            let specialCaseTagInjectionIsBefore = false;

            if (nonTags.length !== 0) {
                let text = HtmlDiff.Utils.WrapText(nonTags.join(''), tag, cssClass);
                that._content.push(text);
            }
            else {
                if (that._specialCaseOpeningTagRegex.test(words[0])) {
                    that._specialTagDiffStack.push(words[0]);
                    specialCaseTagInjection = '<ins class="mod">';
                    if (tag == 'del') {
                        words.shift();

                        while (words.length > 0 && that._specialCaseOpeningTagRegex.test(words[0])) {
                            words.shift();
                        }
                    }
                }
                else if (that._specialCaseClosingTags.hasOwnProperty(words[0].toLowerCase())) {
                    var openingTag = that._specialTagDiffStack.length === 0 ? null : that._specialTagDiffStack.pop();

                    if (openingTag === null || openingTag != words[words.length - 1].replace('/', '')) {
                        // do nothing
                    }
                    else {
                        specialCaseTagInjection = '</ins>';
                        specialCaseTagInjectionIsBefore = true;
                    }

                    if (tag == 'del') {
                        words.shift();

                        while (words.length > 0 && that._specialCaseClosingTags.hasOwnProperty(words[0].toLowerCase())) {
                            words.shift();
                        }
                    }
                }
            }

            if (words.length === 0 && specialCaseTagInjection.length === 0) {
                break;
            }

            if (specialCaseTagInjectionIsBefore) {
                that._content.push(specialCaseTagInjection + ExtractConsecutiveWords(words, HtmlDiff.Utils.IsTag).join(''));
            }
            else {
                that._content.push(ExtractConsecutiveWords(words, HtmlDiff.Utils.IsTag).join('') + specialCaseTagInjection);
            }
        }
    };

    var ExtractConsecutiveWords = function (words, condition) {
        let indexOfFirstTag = null;

        for (let i = 0; i < words.length; i++) {
            let word = words[i];

            if (i === 0 && word == ' ') {
                words[i] = '&nbsp;';
            }

            if (!condition(word)) {
                indexOfFirstTag = i;
                break;
            }
        }

        let items;
        if (indexOfFirstTag !== null) {
            items = words.slice(0, indexOfFirstTag);
            if (indexOfFirstTag > 0) {
                words.splice(0, indexOfFirstTag);
            }
        }
        else {
            items = words.slice();
            words.splice(0);
        }

        return items;
    };

    var Operations = function () {
        let positionInOld = 0, positionInNew = 0;
        let operations = [];

        var matches = MatchingBlocks();

        matches.push(new HtmlDiff.Match(that._oldWords.length, that._newWords.length, 0));

        var mathesWithoutOrphans = RemoveOrphans(matches);

        for (let i = 0; i < mathesWithoutOrphans.length; i++) {
            let matchStartsAtCurrentPositionInOld = positionInOld == mathesWithoutOrphans[i].StartInOld;
            let matchStartsAtCurrentPositionInNew = positionInNew == mathesWithoutOrphans[i].StartInNew;

            let action = null;

            if (matchStartsAtCurrentPositionInOld === false && matchStartsAtCurrentPositionInNew === false) {
                action = HtmlDiff.Action.Replace;
            }
            else if (matchStartsAtCurrentPositionInOld
                        && matchStartsAtCurrentPositionInNew === false) {
                action = HtmlDiff.Action.Insert;
            }
            else if (matchStartsAtCurrentPositionInOld === false) {
                action = HtmlDiff.Action.Delete;
            }
            else {
                action = HtmlDiff.Action.None;
            }

            if (action != HtmlDiff.Action.None) {
                operations.push(
                    new HtmlDiff.Operation(action,
                        positionInOld,
                        mathesWithoutOrphans[i].StartInOld,
                        positionInNew,
                        mathesWithoutOrphans[i].StartInNew));
            }

            if (mathesWithoutOrphans[i].Size !== 0) {
                operations.push(new HtmlDiff.Operation(
                    HtmlDiff.Action.Equal,
                    mathesWithoutOrphans[i].StartInOld,
                    mathesWithoutOrphans[i].EndInOld(),
                    mathesWithoutOrphans[i].StartInNew,
                    mathesWithoutOrphans[i].EndInNew()));
            }

            positionInOld = mathesWithoutOrphans[i].EndInOld();
            positionInNew = mathesWithoutOrphans[i].EndInNew();
        }

        return operations;
    };

    var RemoveOrphans = function (matches) {
        let matchesNoOrphans = [];
        let prev = null;
        let curr = null;
        for (let i = 0; i < matches.length; i++) {
            if (curr === null) {
                prev = new HtmlDiff.Match(0, 0, 0);
                curr = matches[i];
                continue;
            }

            if (prev.EndInOld() == curr.StartInOld && prev.EndInNew() == curr.StartInNew || curr.EndInOld() == matches[i].StartInOld && curr.EndInNew() == matches[i].StartInNew) {
                matchesNoOrphans.push(new HtmlDiff.Match(curr.StartInOld, curr.StartInNew, curr.Size));
                prev = curr;
                curr = matches[i];
                continue;
            }

            let j;
            var oldDistanceInChars = 0;
            for (j = Math.min(prev.EndInOld(), matches[i].StartInOld - prev.EndInOld()); j < Math.max(prev.EndInOld(), matches[i].StartInOld - prev.EndInOld()); j++) {
                oldDistanceInChars += that._oldWords[j].length;
            }

            var newDistanceInChars = 0;
            for (j = Math.min(prev.EndInNew(), matches[i].StartInNew - prev.EndInNew()); j < Math.max(prev.EndInNew(), matches[i].StartInNew - prev.EndInNew()); j++) {
                newDistanceInChars += that._newWords[j].length;
            }

            var currMatchLengthInChars = 0;
            for (j = Math.min(curr.StartInNew, curr.EndInNew() - curr.StartInNew); j < Math.max(curr.StartInNew, curr.EndInNew() - curr.StartInNew); j++) {
                currMatchLengthInChars += that._newWords[j].length;
            }

            if (currMatchLengthInChars > Math.max(oldDistanceInChars, newDistanceInChars) * that.OrphanMatchThreshold) {
                matchesNoOrphans.push(new HtmlDiff.Match(curr.StartInOld, curr.StartInNew, curr.Size));
            }

            prev = curr;
            curr = matches[i];
        }

        matchesNoOrphans.push(new HtmlDiff.Match(curr.StartInOld, curr.StartInNew, curr.Size));
        return matchesNoOrphans;
    };

    var MatchingBlocks = function () {
        var matchingBlocks = [];
        FindMatchingBlocks(0, that._oldWords.length, 0, that._newWords.length, matchingBlocks);
        return matchingBlocks;
    };

    var FindMatchingBlocks = function (startInOld, endInOld, startInNew, endInNew, matchingBlocks) {
        let match = FindMatch(startInOld, endInOld, startInNew, endInNew);

        if (match !== null) {
            if (startInOld < match.StartInOld && startInNew < match.StartInNew) {
                FindMatchingBlocks(startInOld, match.StartInOld, startInNew, match.StartInNew, matchingBlocks);
            }

            matchingBlocks.push(match);

            if (match.EndInOld() < endInOld && match.EndInNew() < endInNew) {
                FindMatchingBlocks(match.EndInOld(), endInOld, match.EndInNew(), endInNew, matchingBlocks);
            }
        }
    };

    var FindMatch = function (startInOld, endInOld, startInNew, endInNew) {
        for (let i = that._matchGranularity; i > 0; i--) {
            let options = new HtmlDiff.MatchOptions();
            options.BlockSize = i;
            options.RepeatingWordsAccuracy = that.RepeatingWordsAccuracy;
            options.IgnoreWhitespaceDifferences = that.IgnoreWhitespaceDifferences;

            let finder = new HtmlDiff.MatchFinder(that._oldWords, that._newWords, startInOld, endInOld, startInNew, endInNew, options);
            let match = finder.FindMatch();
            if (match !== null) {
                return match;
            }
        }

        return null;
    };
}

/* STATIC OBJECTS */

HtmlDiff.Action = {
    Equal: 0,
    Delete: 1,
    Insert: 2,
    None: 3,
    Replace: 4
};

HtmlDiff.Mode = {
    Character: 0,
    Tag: 1,
    Whitespace: 2,
    Entity: 3
};

HtmlDiff.Utils = {
    OpeningTagRegex: new RegExp(/^\s*<[^>]+>\s*$/),
    ClosingTagTexRegex: new RegExp(/^\s*<\/[^>]+>\s*$/),
    TagWordRegex: new RegExp(/<[^\s>]+/),
    WhitespaceRegex: new RegExp(/^(\s|&nbsp;)+$/),
    WordRegex: new RegExp(/[\w\#@]+/),
    SpecialCaseWordTags: ['<img'],
    IsTag: function (item) {
        for (let i = 0; i < HtmlDiff.Utils.SpecialCaseWordTags.length; i++) {
            if (item !== null && item.startsWith(HtmlDiff.Utils.SpecialCaseWordTags[i])) {
                return false;
            }
        }

        return HtmlDiff.Utils.IsOpeningTag(item) || HtmlDiff.Utils.IsClosingTag(item);
    },
    IsOpeningTag: function (item) {
        return HtmlDiff.Utils.OpeningTagRegex.test(item);
    },
    IsClosingTag: function (item) {
        return HtmlDiff.Utils.ClosingTagTexRegex.test(item);
    },
    StripTagAttributes: function (word) {
        let matches = word.match(HtmlDiff.Utils.TagWordRegex);
        let tag = matches.length > 0 ? matches[0] : '';
        word = tag + (word.endsWith('/>') ? '/>' : '>');
        return word;
    },
    WrapText: function (text, tagName, cssClass) {
        return '<' + tagName + ' class="' + cssClass + '">' + text + '</' + tagName + '>';
    },
    IsStartOfTag: function (val) {
        return val == '<';
    },
    IsEndOfTag: function (val) {
        return val == '>';
    },
    IsStartOfEntity: function (val) {
        return val == '&';
    },
    IsEndOfEntity: function (val) {
        return val == ';';
    },
    IsWhiteSpace: function (value) {
        return HtmlDiff.Utils.WhitespaceRegex.test(value);
    },
    StripAnyAttributes: function (word) {
        if (HtmlDiff.Utils.IsTag(word)) {
            return HtmlDiff.Utils.StripTagAttributes(word);
        }

        return word;
    },
    IsWord: function (text) {
        return HtmlDiff.Utils.WordRegex.test(text);
    }
};

HtmlDiff.WordSplitter = {
    ConvertHtmlToListOfWords: function (text, blockExpressions) {
        let mode = HtmlDiff.Mode.Character;
        let currentWord = [];
        let words = [];

        let blockLocations = HtmlDiff.WordSplitter.FindBlocks(text, blockExpressions);

        let isBlockCheckRequired = Object.keys(blockLocations).length > 0;
        let isGrouping = false;
        let groupingUntil = -1;

        for (let index = 0; index < text.length; index++) {
            let character = text[index];

            if (isBlockCheckRequired) {
                if (groupingUntil == index) {
                    groupingUntil = -1;
                    isGrouping = false;
                }

                if (blockLocations.hasOwnProperty(index)) {
                    isGrouping = true;
                    groupingUntil = blockLocations[index];
                }

                if (isGrouping) {
                    currentWord.push(character);
                    mode = HtmlDiff.Mode.Character;
                    continue;
                }
            }

            switch (mode) {
                case HtmlDiff.Mode.Character:

                    if (HtmlDiff.Utils.IsStartOfTag(character)) {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }

                        currentWord = [];
                        currentWord.push('<');
                        mode = HtmlDiff.Mode.Tag;
                    }
                    else if (HtmlDiff.Utils.IsStartOfEntity(character)) {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }

                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Entity;
                    }
                    else if (HtmlDiff.Utils.IsWhiteSpace(character)) {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }

                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Whitespace;
                    }
                    else if (HtmlDiff.Utils.IsWord(character)
                        && (currentWord.length === 0 || HtmlDiff.Utils.IsWord(currentWord[currentWord.length - 1]))) {
                        currentWord.push(character);
                    }
                    else {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }
                        currentWord = [];
                        currentWord.push(character);
                    }

                    break;
                case HtmlDiff.Mode.Tag:

                    if (HtmlDiff.Utils.IsEndOfTag(character)) {
                        currentWord.push(character);
                        words.push(currentWord.join(''));
                        currentWord = [];

                        mode = HtmlDiff.Utils.IsWhiteSpace(character) ? HtmlDiff.Mode.Whitespace : HtmlDiff.Mode.Character;
                    }
                    else {
                        currentWord.push(character);
                    }

                    break;
                case HtmlDiff.Mode.Whitespace:

                    if (HtmlDiff.Utils.IsStartOfTag(character)) {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }
                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Tag;
                    }
                    else if (HtmlDiff.Utils.IsStartOfEntity(character)) {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }

                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Entity;
                    }
                    else if (HtmlDiff.Utils.IsWhiteSpace(character)) {
                        currentWord.push(character);
                    }
                    else {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }

                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Character;
                    }

                    break;
                case HtmlDiff.Mode.Entity:
                    if (HtmlDiff.Utils.IsStartOfTag(character)) {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }

                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Tag;
                    }
                    else if (HtmlDiff.Utils.IsWhiteSpace(character)) {
                        if (currentWord.length !== 0) {
                            words.push(currentWord.join(''));
                        }
                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Whitespace;
                    }
                    else if (HtmlDiff.Utils.IsEndOfEntity(character)) {
                        let switchToNextMode = true;
                        if (currentWord.length != 0) {
                            currentWord.push(character);
                            words.push(currentWord.join(''));

                            if (words.length > 2 && HtmlDiff.Utils.IsWhiteSpace(words[words.length - 2]) && HtmlDiff.Utils.IsWhiteSpace(words[words.length - 1])) {
                                var w1 = words[words.length - 2];
                                var w2 = words[words.length - 1];

                                words.pop();
                                words.pop();
                                currentWord = [];

                                currentWord = currentWord.concat(w1.split(''));
                                currentWord = currentWord.concat(w2.split(''));
                                mode = HtmlDiff.Mode.Whitespace;
                                switchToNextMode = false;
                            }
                        }

                        if (switchToNextMode) {
                            currentWord = [];
                            mode = HtmlDiff.Mode.Character;
                        }
                    }
                    else if (HtmlDiff.Utils.IsWord(character)) {
                        currentWord.push(character);
                    }
                    else {
                        if (currentWord.length != 0) {
                            words.push(currentWord.join(''));
                        }

                        currentWord = [];
                        currentWord.push(character);
                        mode = HtmlDiff.Mode.Character;
                    }
                    break;
            }
        }
        if (currentWord.length != 0) {
            words.push(currentWord.join(''));
        }

        return words;
    },
    FindBlocks: function (text, blockExpressions) {
        let blockLocations = {};

        if (blockExpressions == null) {
            return blockLocations;
        }

        for (let i = 0; i < blockExpressions.length; i++) {
            let matches = text.match(blockExpressions[i]);
            if (!matches) continue;
            let matchEnd = 0;
            for (let j = 0; j < matches.length; j++) {
                let index = text.indexOf(matches[j], matchEnd);
                blockLocations[index] = index + matches[j].length;
                matchEnd = index + matches[j].length;
            }
        }

        return blockLocations;
    }
};

/* INSTANTIATED OBJECTS */

HtmlDiff.Match = function (startInOld, startInNew, size) {
    this.StartInOld = startInOld;
    this.StartInNew = startInNew;
    this.Size = size;
    this.EndInOld = function () {
        return this.StartInOld + this.Size;
    };
    this.EndInNew = function () {
        return this.StartInNew + this.Size;
    };
};

HtmlDiff.Operation = function (action, startInOld, endInOld, startInNew, endInNew) {
    this.Action = action;
    this.StartInOld = startInOld;
    this.EndInOld = endInOld;
    this.StartInNew = startInNew;
    this.EndInNew = endInNew;
};

HtmlDiff.MatchOptions = function () {
    this.BlockSize = 0;
    this.RepeatingWordsAccuracy = 0;
    this.IgnoreWhitespaceDifferences = false;
};

HtmlDiff.MatchFinder = function (oldWords, newWords, startInOld, endInOld, startInNew, endInNew, options) {
    this._oldWords = oldWords;
    this._newWords = newWords;
    this._startInOld = startInOld;
    this._endInOld = endInOld;
    this._startInNew = startInNew;
    this._endInNew = endInNew;
    this._wordIndices = null;
    this._options = options;
    var that = this;

    this.IndexNewWords = function () {
        that._wordIndices = {};
        let block = [];
        for (let i = that._startInNew; i < that._endInNew; i++) {

            let word = that.NormalizeForIndex(that._newWords[i]);
            let key = that.PutNewWord(block, word, that._options.BlockSize);

            if (key == null) {
                continue;
            }

            if (that._wordIndices.hasOwnProperty(key)) {
                that._wordIndices[key].push(i);
            }
            else {
                that._wordIndices[key] = [i];
            }
        }
    };

    this.PutNewWord = function (block, word, blockSize) {
        block.push(word);
        if (block.length > blockSize) {
            block.shift();
        }

        if (block.length != blockSize) {
            return null;
        }

        var result = '';
        for (let i = 0; i < block.length; i++) {
            result += block[i];
        }

        return result;
    };

    this.NormalizeForIndex = function (word) {
        word = HtmlDiff.Utils.StripAnyAttributes(word);
        if (that._options.IgnoreWhitespaceDifferences && HtmlDiff.Utils.IsWhiteSpace(word)) {
            return ' ';
        }

        return word;
    };

    this.FindMatch = function () {
        that.IndexNewWords();
        that.RemoveRepeatingWords();

        if (Object.keys(that._wordIndices).length == 0) {
            return null;
        }

        let bestMatchInOld = that._startInOld;
        let bestMatchInNew = that._startInNew;
        let bestMatchSize = 0;

        var matchLengthAt = {};
        var block = [];

        for (let indexInOld = that._startInOld; indexInOld < that._endInOld; indexInOld++) {
            var word = that.NormalizeForIndex(that._oldWords[indexInOld]);
            var index = that.PutNewWord(block, word, that._options.BlockSize);

            if (index == null) {
                continue;
            }

            var newMatchLengthAt = {};

            if (!that._wordIndices.hasOwnProperty(index)) {
                matchLengthAt = newMatchLengthAt;
                continue;
            }

            for (let i = 0; i < that._wordIndices[index].length; i++) {
                let newMatchLength = (matchLengthAt.hasOwnProperty(that._wordIndices[index][i] - 1) ? matchLengthAt[that._wordIndices[index][i] - 1] : 0) + 1;
                newMatchLengthAt[that._wordIndices[index][i]] = newMatchLength;

                if (newMatchLength > bestMatchSize) {
                    bestMatchInOld = indexInOld - newMatchLength + 1 - that._options.BlockSize + 1;
                    bestMatchInNew = that._wordIndices[index][i] - newMatchLength + 1 - that._options.BlockSize + 1;
                    bestMatchSize = newMatchLength;
                }
            }

            matchLengthAt = newMatchLengthAt;
        }

        return bestMatchSize != 0 ? new HtmlDiff.Match(bestMatchInOld, bestMatchInNew, bestMatchSize + that._options.BlockSize - 1) : null;
    };

    this.RemoveRepeatingWords = function () {
        var threshold = that._newWords.length * that._options.RepeatingWordsAccuracy;
        var repeatingWords = [];
        for (let w in that._wordIndices) {
            if (!that._wordIndices.hasOwnProperty(w)) {
                continue;
            }

            if (that._wordIndices[w].length > threshold) {
                repeatingWords.push(w);
            }
        }

        for (let i = 0; i < repeatingWords.length; i++) {
            delete that._wordIndices[repeatingWords[i]];
        }
    };
};

export { HtmlDiff };
export default HtmlDiff;
