import requests
from flask import Flask, render_template, jsonify, request
import logging
import math
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_BASE = "https://www.microburbs.com.au/report_generator/api/suburb"
API_TOKEN = "Bearer test"
REQUEST_TIMEOUT = 10

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


def clean_nan(obj):
    """Recursively replace NaN and inf values with None."""
    if isinstance(obj, dict):
        return {key: clean_nan(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [clean_nan(item) for item in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


def fetch_api(endpoint, suburb, property_type=None):
    """Generic API fetch function."""
    url = f"{API_BASE}/{endpoint}"
    headers = {"Authorization": API_TOKEN, "Content-Type": "application/json"}
    params = {"suburb": suburb}
    if property_type:
        params["property_type"] = property_type
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        return clean_nan(data)
    except Exception as e:
        logger.error(f"API {endpoint} failed: {e}")
        return None


def process_properties(data):
    """Extract insights from properties data."""
    if not data or "results" not in data:
        return {"insights": {}, "properties": []}
    
    properties = data["results"]
    prices = [p["price"] for p in properties if p.get("price")]
    land_sizes = []
    
    for prop in properties:
        land = prop.get("attributes", {}).get("land_size", "0")
        if isinstance(land, str):
            try:
                size = int(land.split()[0])
                if size > 0:
                    land_sizes.append(size)
            except:
                pass
        elif land:
            land_sizes.append(int(land))
    
    avg_price = sum(prices) / len(prices) if prices else 0
    avg_land = sum(land_sizes) / len(land_sizes) if land_sizes else 0
    
    return {
        "insights": {
            "total": len(properties),
            "avg_price": round(avg_price, 0),
            "avg_land_size": round(avg_land, 0),
            "price_per_sqm": round(avg_price / avg_land, 0) if avg_land > 0 else 0
        },
        "properties": properties
    }


def process_demographics(data):
    """Extract key demographics."""
    if not data or "age_brackets" not in data:
        return {}
    
    age_data = [a for a in data["age_brackets"] if a["gender"] == "persons"]
    return {"age_brackets": age_data}


def process_market(data):
    """Extract latest market trends."""
    if not data or "results" not in data or not data["results"]:
        return {}
    
    latest = sorted(data["results"][0], key=lambda x: x["date"], reverse=True)[:12]
    return {"recent_trends": latest}


def process_schools(data):
    """Extract school summary."""
    if not data or "results" not in data:
        return {}
    
    schools = data["results"]
    return {
        "total": len(schools),
        "schools": schools
    }


def process_amenities(data):
    """Count amenities by category."""
    if not data or "results" not in data:
        return {}
    
    categories = {}
    for amenity in data["results"]:
        cat = amenity.get("category", "Unknown")
        categories[cat] = categories.get(cat, 0) + 1
    
    return {"categories": categories, "total": len(data["results"])}


def process_risk(data):
    """Extract risk factors."""
    if not data or "results" not in data:
        return {}
    
    risks = {}
    for item in data["results"]:
        name = item.get("name")
        value = item.get("value")
        if name and value:
            if name not in risks:
                risks[name] = []
            risks[name].append(value)
    
    return {"risks": risks}


def process_summary(data):
    """Extract summary scores."""
    if not data or "results" not in data:
        return {}
    
    return {"scores": data["results"]}


@app.route("/")
def index():
    """Serve main dashboard."""
    return render_template("index.html")


@app.route("/api/data")
def get_data():
    """
    Fetch data for selected endpoints.
    Query params: suburb, endpoints (comma-separated), property_type
    """
    suburb = request.args.get("suburb", "Belmont North")
    endpoints = request.args.get("endpoints", "properties").split(",")
    property_type = request.args.get("property_type", "house")
    
    logger.info(f"Fetching {endpoints} for {suburb}")
    
    response = {}
    
    for endpoint in endpoints:
        endpoint = endpoint.strip()
        
        if endpoint == "properties":
            data = fetch_api("properties", suburb, property_type)
            response["properties"] = process_properties(data) if data else {}
        
        elif endpoint == "demographics":
            data = fetch_api("demographics", suburb)
            response["demographics"] = process_demographics(data) if data else {}
        
        elif endpoint == "market":
            data = fetch_api("market", suburb)
            response["market"] = process_market(data) if data else {}
        
        elif endpoint == "schools":
            data = fetch_api("schools", suburb)
            response["schools"] = process_schools(data) if data else {}
        
        elif endpoint == "amenity":
            data = fetch_api("amenity", suburb)
            response["amenity"] = process_amenities(data) if data else {}
        
        elif endpoint == "risk":
            data = fetch_api("risk", suburb)
            response["risk"] = process_risk(data) if data else {}
        
        elif endpoint == "summary":
            data = fetch_api("summary", suburb)
            response["summary"] = process_summary(data) if data else {}
    
    return jsonify(response)


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Chat endpoint with Duke - Microburbs expert assistant.
    Expects: {"message": "user question", "context": {dashboard data}}
    """
    try:
        data = request.json
        user_message = data.get("message", "")
        context = data.get("context", {})
        
        if not user_message:
            return jsonify({"error": "No message provided"}), 400
        
        # Build comprehensive context for Duke
        system_prompt = """You are Duke, the friendly and professional real estate assistant for Microburbs Australia. 

Your personality:
- Formal but approachable
- Expert in Australian property market and housing
- Precise with data and insights
- Always use Australian terminology (e.g., "suburb" not "neighborhood")
- Reference specific numbers and property addresses when relevant
- If asked about a specific property, search through the listings data

Current Dashboard Context for """ + context.get('suburb', 'this area') + """:\n\n"""
        
        # Add detailed properties context
        if "properties" in context and "listings" in context["properties"]:
            props = context["properties"]
            listings = props.get("listings", [])
            
            system_prompt += f"""PROPERTY LISTINGS ({props.get('total', 0)} total):
Average Price: ${props.get('avg_price', 0):,}
Average Land Size: {props.get('avg_land_size', 0)} m²
Price per m²: ${props.get('price_per_sqm', 0):,}

Individual Properties:
"""
            for i, prop in enumerate(listings, 1):
                system_prompt += f"""{i}. {prop.get('address', 'N/A')}
   - Price: ${prop.get('price', 0):,}
   - Bedrooms: {prop.get('bedrooms', 'N/A')}
   - Bathrooms: {prop.get('bathrooms', 'N/A')}
   - Land Size: {prop.get('land_size', 'N/A')}
   - Listed: {prop.get('listing_date', 'N/A')}

"""
        
        # Add market context
        if "market" in context:
            market = context["market"]
            system_prompt += f"""MARKET TRENDS:
Latest Median Price: ${market.get('latest_price', 0):,}
Growth Rate: {market.get('growth', 'N/A')}
"""
            if "recent_data" in market:
                system_prompt += "Recent Price History:\n"
                for trend in market["recent_data"]:
                    system_prompt += f"  - {trend['date']}: ${trend['price']:,}\n"
            system_prompt += "\n"
        
        # Add schools context
        if "schools" in context:
            schools = context["schools"]
            system_prompt += f"""SCHOOLS:
Total: {schools.get('total', 0)} ({schools.get('public', 0)} public, {schools.get('private', 0)} private)
"""
            if "list" in schools:
                system_prompt += "Notable Schools:\n"
                for school in schools["list"]:
                    system_prompt += f"  - {school['name']} ({school['type']}, {school['level']})\n"
            system_prompt += "\n"
        
        # Add demographics context
        if "demographics" in context and "age_distribution" in context["demographics"]:
            system_prompt += "DEMOGRAPHICS (Age Distribution):\n"
            for age in context["demographics"]["age_distribution"]:
                system_prompt += f"  - {age['age_range']} years: {age['percentage']}%\n"
            system_prompt += "\n"
        
        # Add amenities context
        if "amenities" in context:
            amenities = context["amenities"]
            system_prompt += f"LOCAL AMENITIES ({amenities.get('total', 0)} total):\n"
            if "top_categories" in amenities:
                for cat in amenities["top_categories"]:
                    system_prompt += f"  - {cat['category']}: {cat['count']}\n"
            system_prompt += "\n"
        
        # Add summary scores
        if "summary" in context and "scores" in context["summary"]:
            system_prompt += "AREA SCORES:\n"
            for score in context["summary"]["scores"]:
                system_prompt += f"  - {score['name']}: {score['value']} ({score['comment']})\n"
            system_prompt += "\n"
        
        system_prompt += """
Guidelines:
- When asked about specific properties, reference them by their exact address
- Use specific numbers from the data above
- If asked about data not shown, say "I can see X properties currently listed" and work with available data
- Keep responses concise (2-4 paragraphs)
- Use Australian English spelling
- Be helpful and specific
"""
        
        logger.info(f"Chat request: {user_message[:100]}")
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        assistant_message = response.choices[0].message.content
        logger.info(f"Chat response generated: {len(assistant_message)} chars")
        
        return jsonify({"response": assistant_message})
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        return jsonify({
            "error": "I apologize, but I'm having trouble processing your request. Please try again.",
            "details": str(e)
        }), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)