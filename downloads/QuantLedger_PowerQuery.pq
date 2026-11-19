// QuantLedger Microsoft Excel Desktop Power Query (M) Function — v2.8.0
// 1. In Excel Desktop: Data -> Get Data -> From Other Sources -> Blank Query -> Advanced Editor
// 2. Paste this query, click Done, and invoke fnQuantLedger("ENGINE", "BI-17", "NY", "schedule", "")
let
    fnQuantLedger = (
        formulaType as text,
        engineCode as text,
        jurisdiction as text,
        outputMode as text,
        optional rapidApiKey as nullable text
    ) as table =>
    let
        cleanKey = if rapidApiKey = null then "" else Text.Trim(rapidApiKey),
        usePro = Text.Length(cleanKey) > 0,
        targetUrl = if usePro
            then "https://quantledger-73-engine-financial-and-statutory-api.p.rapidapi.com/v1/spreadsheet/formula-eval"
            else "https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app/v1/public/spreadsheet-demo",
        reqHeaders = if usePro
            then [#"Content-Type"="application/json", #"X-RapidAPI-Key"=cleanKey, #"X-RapidAPI-Host"="quantledger-73-engine-financial-and-statutory-api.p.rapidapi.com"]
            else [#"Content-Type"="application/json"],
        bodyBytes = Json.FromValue([
            formula_type = formulaType,
            engine_code = engineCode,
            jurisdiction = jurisdiction,
            output_mode = outputMode,
            max_rows = if usePro then 100 else 12
        ]),
        rawResp = Web.Contents(targetUrl, [Headers = reqHeaders, Content = bodyBytes]),
        parsed = Json.Document(rawResp),
        rowsList = parsed[rows],
        colNames = List.Transform(rowsList{0}, each Text.From(_)),
        dataRows = List.Skip(rowsList, 1),
        outTable = Table.FromRows(dataRows, colNames)
    in
        outTable
in
    fnQuantLedger
