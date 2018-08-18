const constants = require("../constants.js");
const kwnodes = require("./keywordnodes/kwnodes.js");
const nodeLiterals = require("./nodeLiterals/nodeliterals.js");
const helpers = require("./parser_helper_function.js");
const BaseKwNode = require("./keywordnodes/basekwnode.js");
class Parser {

    constructor(lexer) {
        this.lexer = lexer;
        this.isArithmeticExpression = true;
        this.currentBlockType = [];
        this.initNodeExpresssionPunctuationTokenParsers();
    }

    initNodeExpresssionPunctuationTokenParsers() {
        this.expressionPunctuationParsers = {};
        this.expressionPunctuationParsers[constants.L_BRACKET_SYM_NAME] = this.parseBracketExpression.bind(this); //handle operator precedence with bracket
        this.expressionPunctuationParsers[constants.L_SQ_BRACKET_SYM_NAME] = this.parseArray.bind(this);
    }

    isPunctuation(punc) {
        const token = this.lexer.peek();
        return token && token.type == constants.PUNCTUATION && (token.value == punc);
    }

    isOperator(op) {
        const token = this.lexer.peek();
        return token && token.type == constants.OPERATOR && (token.value == op);
    }

    isKeyword(kw) {
        const token = this.lexer.peek();
        return token && token.type == constants.KEYWORD && (token.value == kw);
    }

    skipPunctuation(punc) {
        if (this.isPunctuation(punc)) this.lexer.next();
        else this.lexer.throwError(this.getGenericErrorMsg(this.getCurrentTokenValue()));
    }

    skipOperator(op) {
        if (this.isOperator(op)) this.lexer.next();
        else this.lexer.throwError(this.getGenericErrorMsg(this.getCurrentTokenValue()));
    }

    skipKeyword(kw) {
        if (this.isKeyword(kw)) this.lexer.next();
        else this.lexer.throwError(this.getGenericErrorMsg(this.getCurrentTokenValue()));
    }

    getCurrentTokenValue() {
        return this.lexer.peek() ? this.lexer.peek().value : null;
    }

    //backtracking is used in handling operator precedence while parsing the expression
    parseExpression() {
       return this.parseOr();
    }

    parseOr() {
        return this.parseWhile([constants.SYM.OR], this.parseAnd);
    }

    parseAnd() {
        return this.parseWhile([constants.SYM.AND], this.parseGreaterLesserEquality);
    }

    parseGreaterLesserEquality() {
        const operatorList = [
            constants.SYM.L_THAN, constants.SYM.G_THAN, constants.SYM.G_THAN_OR_EQ,  
            constants.SYM.L_THAN_OR_EQ, constants.SYM.EQ, constants.SYM.NOT_EQ
        ];

        if (this.isArithmeticExpression) return this.parseWhile(operatorList, this.parsePlusMinus);
        else return this.parseWhile(operatorList, this.parseNodeLiteral); //it is a boolean expression
    }

    parsePlusMinus() {
        return this.parseWhile([constants.SYM.PLUS, constants.SYM.MINUS], this.parseMultiplyDivisionRemainder);
    }

    parseMultiplyDivisionRemainder() {
        return this.parseWhile([constants.SYM.MULTIPLY, constants.SYM.DIVIDE, constants.SYM.REMAINDER], this.parseNodeLiteral);
    }

    parseWhile(operatorList, parseOperationWithLesserPrecedence) {
        let node = parseOperationWithLesserPrecedence.bind(this)();

        while (operatorList.indexOf(this.lexer.peek().value) >= 0) {
            node = {
                left : node,
                operation : this.lexer.next().value,
                right : parseOperationWithLesserPrecedence.bind(this)(),
                value : null
            };
        }

        return node;
    }

    parseNodeLiteral() {
        const token = this.lexer.peek();

        if (nodeLiterals[token.type] != undefined) {
            return nodeLiterals[token.type].getNodeLiteral.call(this);
        }

        //find the name of the property of the current token value
        const constantsPropertyList = Object.keys(constants.SYM);
        const constantsPropertyValuesList = Object.values(constants.SYM);
        const index = constantsPropertyValuesList.indexOf(token.value);
        const property_name = constantsPropertyList[index];

        //check if property_name is a punctuation that can be used in an expression e.g (, [
        if (this.expressionPunctuationParsers[property_name] != undefined) {  
            return this.expressionPunctuationParsers[property_name]();
        }

        this.lexer.throwError(this.getGenericErrorMsg(token.type));
    }

    parseBracketExpression(isArithmetic = true) {
        this.skipPunctuation(constants.SYM.L_BRACKET);
        this.isArithmeticExpression = isArithmetic;
        const node = this.parseExpression();
        this.isArithmeticExpression = true; //set back to default
        this.skipPunctuation(constants.SYM.R_BRACKET);

        return node;
    }

    parseArray(arrayNameToken) {
        let node = {};
        node.operation = constants.ARRAY;

        if (arrayNameToken == undefined) { //it is an array literal e.g [1,2,3]
            node.body = this.parseDelimited( 
                constants.SYM.L_SQ_BRACKET , constants.SYM.R_SQ_BRACKET, constants.SYM.COMMA, 
                this.getTokenThatSatisfiesPredicate.bind(this), this.isNumStringVariable.bind(this)
            );
        } else { //it is an array element a[0]
            node.name = arrayNameToken.value;
            this.skipPunctuation(constants.SYM.L_SQ_BRACKET);
            node.index = this.lexer.next().value;
            this.skipPunctuation(constants.SYM.R_SQ_BRACKET);

            if (this.isOperator(constants.SYM.ASSIGN)) {
                this.skipOperator(constants.SYM.ASSIGN);
                node = {
                    left: node,
                    right: this.parseExpression(),
                    operation: constants.SYM.ASSIGN,
                    value: null                
                }; // a[0] = b = c = 2
            }
        }

        return node;
    }

    isNumStringVariable(token) {
        return token.type == constants.NUMBER || token.type == constants.STRING || token.type == constants.VARIABLE;
    }

    parseLeaf() {
        return {
            value: this.lexer.next().value,
            left: null,
            right: null,
            operation: null
        };
    }

    parseBool() {
        if ([constants.KW.OOTO, constants.KW.IRO].indexOf(this.lexer.peek().value) >= 0) {
            return this.parseLeaf();
        }
            
        this.lexer.throwError(`Expecting yorlang boolean(iró|òótó) but found ${token.value}`);
    }

    parseBlock(currentBlock) {
        this.currentBlockType.push(currentBlock);
        this.skipPunctuation(constants.SYM.L_PAREN);
        const block = []; 
        while (this.lexer.isNotEndOfFile() && this.lexer.peek().value != constants.SYM.R_PAREN) {
            block.push(this.parseAst());
        }
        this.skipPunctuation(constants.SYM.R_PAREN);
        this.currentBlockType.pop();

        return block;
    }

    parseVarname() {
        return  (this.lexer.peek().type == constants.VARIABLE) 
                ? { name: this.lexer.next().value }
                : this.lexer.throwError(`Expecting variable but found ${token}`);
    }

    parseCallIse(token) {
        return {
            operation: constants.CALL_ISE,
            name: token.value,
            args: this.parseDelimited( 
                constants.SYM.L_BRACKET , constants.SYM.R_BRACKET, constants.SYM.COMMA, 
                this.getTokenThatSatisfiesPredicate.bind(this), this.isNumStringVariable.bind(this)
            )
        }; 
    }

    parseDelimited(start, stop, separator, parser, predicate) {
        const varList = []; let firstVar = true;

        this.skipPunctuation(start);
        while(this.lexer.isNotEndOfFile()) {
            if (this.isPunctuation(stop)) break;
            if (firstVar) firstVar = false; else this.skipPunctuation(separator);
            if (this.isPunctuation(stop)) break; //this is necessary for an optional last separator
            varList.push(parser(predicate));
        }
        this.skipPunctuation(stop);

        return varList;
    }

    getTokenThatSatisfiesPredicate(predicate) {
        var token = this.lexer.next();
        if (predicate(token)) return token;

        this.lexer.throwError(this.getGenericErrorMsg(token.type));
    }

    getCurrentBlockType() {
        return this.currentBlockType[this.currentBlockType.length - 1];
    }

    isBlockType() {
        return this.currentBlockType.length > 0;
    }

    getGenericErrorMsg(value) {
        return `Cannot process unexpected token : ${value}`;
    }

    parseAst() {
        const token = this.lexer.peek();

        if ((kwnodes[token.value] != undefined)) {
            const kwNode = kwnodes[token.value];
            if (kwNode instanceof BaseKwNode) return kwNode.getNode.call(this); //call the method getNode in kwNode object like an extension function to the class Parser
            else throw new Error(`${token.value} must be a subclass of BaseKwNode`);
        }

        if (token.type == constants.VARIABLE) {
            const node = this.parseCallIse(this.lexer.next());
            this.skipPunctuation(constants.SYM.STATEMENT_TERMINATOR);
            return node;
        }

        this.lexer.throwError(this.getGenericErrorMsg(token.value));
    }

    parseProgram() {
        const astList = [];

        this.currentBlockType.push(constants.PROGRAM);
        while (this.lexer.isNotEndOfFile()) {
            astList.push(this.parseAst());
        }
        this.currentBlockType.pop();

        return {type: constants.PROGRAM, astList: astList};
    }
}

const helpersNameList = Object.keys(helpers);
helpersNameList.forEach((helperName,index,array) => {
    Parser.prototype[helperName] = helpers[helperName];
});

module.exports = Parser;