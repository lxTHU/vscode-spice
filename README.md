# SPICE support for VSCode

> SPICE syntax highlighting refenence [leoheck/sublime-spice](https://github.com/leoheck/sublime-spice) TextMate rules.
> 
> Other useful rules reference see: [1995parham/vim-spice](https://github.com/1995parham/vim-spice)
> 
> Snippets reference: [bzisjo/vscode-spice-support](https://github.com/bzisjo/vscode-spice-support)

## GitHub repos
[lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice)

## See also
[Seeing SPICE in VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=xuanli.spice)

# Features
## Done
- Comment **toggle**
- Syntax Highlighting of 
    - Comments `*|;|&` 
    - Circuits Elements `R|...` `V|...` `X|...` 
    - Expressions `abs()|...` `""` 
    - SPICE Commands `.subckt|...` `.tran|...` 
- Snippets
    - Basic `.ac/.dc/.tran`
    - `.meas rise/fall/delay`

## In progress
- [ ] Divide SPICE Dot Commands into: 
    - [ ] Hierarcy Block `.end|ends|lib|subckt`
    - [ ] Dot Schematic Command `.backanno|global|include|machine|model|net|`
    - [ ] Dot Simulation Run `.ac|dc|four|ic|noise|op|tf|tran`
    - [ ] Dot Simulation Parameter`.func|ferret|loadbias|meas|nodeset|options|param|save|savebias|step|temp|wave`
- [ ] Determine name--string of `./syntaxes/SPICE.tmlanguage` for mostly used Themes. *(reference Themes' .json file's `scope`&`colors`)* 
- [ ] Add support for **non**-`Monokai` color themes.
    - [x] support for `Dark+ (default dark)`

## In the future
- [ ] Add more snippets support
    - [x] Basic `.ac/.dc/.tran`
    - [x] `.meas rise/fall/delay`

## Contributing
1. Fork it ( [https://github.com/lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice) )
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request


## Change Log
[0.1.0]
- Add Basic Snippets Support. (ref [bzisjo's great work](https://github.com/bzisjo/vscode-spice-support))

[0.0.6]
- Fix **toogle comment bug**: you can use `Ctrl+/` to add `*` comment toggle.
